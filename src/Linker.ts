import {OpCode,Type,Op} from './OpCode'
import {ObjectMetadata} from './Compiler'
import StringStorage from './StringStorage'

const mmidOffset = 128

export interface CompiledFile{
	code: Uint32Array
	base: string
	path: string
	objects: ObjectMetadata[]
	strings: string[]
}

interface ObjectTreeNode{
	id: number
	name: string
	type: Type
	children: Map<string,ObjectTreeNode>
	file?: CompiledFile
	parent?: ObjectTreeNode
	address?: number
	proxy?: ObjectTreeNode
}

const magicDWord = 0xB5006BB1
const headerSize = 20
const objectSize = 16
const opCodeSize = 4

function dWordAlign(addr:number){
	return addr + ((addr&3) ? 4-(addr&3) : 0)
}

function writeHeader(buffer:Uint8Array, codeSectionSize:number, objectSectionSize:number, stringSectionSize:number){
	const u32 = new Uint32Array(buffer.buffer)
	u32[0] = magicDWord
	u32[1] = codeSectionSize
	u32[2] = objectSectionSize
	u32[3] = stringSectionSize
	u32[4] = mmidOffset
	return headerSize
}

function writeCodeSection(buffer:Uint8Array, offset:number, code:number[]){
	if(offset&3)
		throw new Error('align error')
	const u32 = new Uint32Array(buffer.buffer,offset)
	u32.set(code)
	return opCodeSize*code.length
}

function writeObjectSection(buffer:Uint8Array, offset:number, tree:ObjectTree, stringSection:StringSection, externSection:ExternSection){
	if(offset&3)
		throw new Error('align error')
	const u32 = new Uint32Array(buffer.buffer,offset)
	let pos = 0
	for(const o of tree){
		u32[pos+0] = o.type
		u32[pos+1] = stringSection.get(o.name)
		u32[pos+2] = o.parent?o.parent.id:0xFFFFFFFF
		if(o.type == Type.EXTERN){
			if(typeof o.address == 'undefined')
				throw new Error('invalid extern')
			u32[pos+3] = externSection.get(o.address)
		}else{
			u32[pos+3] = (typeof o.address == 'undefined')?0xFFFFFFFF:o.address
		}
		pos += 4
	}
	return pos*4
}

class ObjectTree implements Iterable<ObjectTreeNode>{
	root:ObjectTreeNode
	constructors: ObjectTreeNode[]
	private nodes:ObjectTreeNode[]
	private nodesFileMap:Map<string,ObjectTreeNode[]>
	private externs = new StringStorage()
	constructor(data:CompiledFile[]){
		this.root = {
			id: mmidOffset,
			name:'root',
			type:Type.NAMESPACE,
			children:new Map(),
		}
		this.constructors = []
		this.nodes = [this.root]
		this.nodesFileMap = new Map()
		let id = mmidOffset+1
		const imports:ObjectTreeNode[] = []
		for(const file of data){
			const lut = []
			let base:ObjectTreeNode = this.root
			if(file.base){
				for(const name of file.base.split('.')){
					const newbase = base.children.get(name)
					if(newbase){
						base = newbase
					}else{
						const ns:ObjectTreeNode = {
							name:name,
							type:Type.NAMESPACE,
							parent:base,
							children:new Map(),
							id: id++
						}
						this.nodes.push(ns)
						base.children.set(name,ns)
						base = ns
					}
				}
			}
			let localroot:(ObjectTreeNode|undefined)
			for(const metadata of file.objects){
				const o:ObjectTreeNode = {
					name: file.strings[metadata.name],
					type: metadata.type,
					children: new Map(),
					id: metadata.type==Type.IMPORT||metadata.type==Type.STUB?0:id++
				}
				lut.push(o)
				if(o.id>0)
					this.nodes.push(o)
				else if(metadata.type == Type.IMPORT)
					imports.push(o)
				if(metadata.type == Type.EXTERN){
					if(typeof metadata.address == 'undefined')
						throw new Error('invalid extern')
					o.address = this.externs.intern(file.strings[metadata.address])
				}
				if(typeof metadata.parent == 'undefined')
					localroot = o
				if(!o.parent)
					localroot = o
			}
			for(let i=0; i<file.objects.length; i++){
				const metadata = file.objects[i]
				const o = lut[i]
				o.parent = (typeof metadata.parent == 'undefined')?base:lut[metadata.parent]
				if(o.parent == localroot)
					o.parent = base
				if(o != localroot){
					const name = o.type == Type.IMPORT ? o.name.split('.').pop()! : o.name
					if(o.parent.children.has(name))
						throw new Error(`link error, object '${name}' redefined`)
					o.parent.children.set(name,o)
				}
			}
			if(!localroot)
				throw new Error('local root object not found')
			localroot.name = `${file.path.slice(0,-5)}@main`
			localroot.proxy = base
			if(localroot.type != Type.STUB)
				this.constructors.push(localroot)
			this.nodesFileMap.set(file.path,lut)
		}
		this.evaulateImports(imports)
	}
	[Symbol.iterator](){
		return this.nodes[Symbol.iterator]()
	}
	get size(){
		return this.nodes.length
	}
	get(id:number){
		return this.nodes[id-mmidOffset]
	}
	getExterns(){
		return this.externs
	}
	getFileLut(file:CompiledFile){
		return this.nodesFileMap.get(file.path)
	}
	resolvePathAbs(path:string[], context:ObjectTreeNode){
		let ctx = context
		while(true){
			if(path[0] == 'parent'){
				// to do: better error msg
				if(!ctx.parent)
					throw new Error('root has no parent')
				ctx = ctx.parent
				path.shift()
			}else{
				const next = ctx.children.get(path[0])
				if(!next)
					break
				ctx = next
				path.shift()
			}
		}
		if(ctx.type == Type.IMPORT)
			ctx = ctx.proxy!
		return {ctx,path}
	}
	resolvePath(path:string[], context:ObjectTreeNode){
		switch(path[0]){
			//case '': return this.resolvePathAbs(path.slice(1))
			case 'root': return this.resolvePathAbs(path.slice(1),this.root)
			case 'self': return this.resolvePathAbs(path.slice(1),context)
			case 'parent': return this.resolvePathAbs(path.slice(0),context)
		}
		let ctx:ObjectTreeNode|undefined = context
		while(ctx){
			const next = ctx.children.get(path[0])
			if(next)
				return this.resolvePathAbs(path.slice(1),next)
			ctx = ctx.parent
		}
		// to do: better error msg
		throw new Error(`can not resolve path '${path.join('.')}'`)
	}
	private evaulateImports(imports:ObjectTreeNode[]){
		for(const o of imports){
			const src = this.resolvePath(o.name.split('.'),o.parent || this.root)
			if(src.path.length != 0)
				throw new Error(`could not resolve import '${o.name}'`)
			o.id = src.ctx.id
			o.children = src.ctx.children
			o.name = src.ctx.name
			o.proxy = src.ctx
		}
	}
}

class ExternSection{
	size = 0
	private map:Map<number,number>
	private externs:StringStorage
	constructor(externs:StringStorage){
		this.externs = externs
		const lut = externs.getLut()
		const map:Map<number,number> = new Map()
		let offset = 0
		for(let i=0; i<lut.length; i++){
			map.set(i,offset)
			offset += lut[i].length+1
		}
		this.map = map
		this.size = dWordAlign(offset)
	}
	get(n:number){
		const addr = this.map.get(n)
		if(typeof addr == 'undefined')
			throw new Error('unknown extern index')
		return addr
	}
	write(buffer:Uint8Array, offset:number){
		if(offset&3)
			throw new Error('align error')
		const out = Buffer.from(this.externs.getLut().join('\0')+'\0','ascii')
		if(dWordAlign(out.length) != this.size)
			throw new Error('extern section size missmatch')
		buffer.set(out,offset)
		return this.size
	}
}

class StringSection{
	size = 0
	private strings:StringStorage
	constructor(strings:StringStorage){
		this.strings = strings
		const lut = strings.getLut()
		const map:Map<number,number> = new Map()
		let offset = 0
		for(let i=0; i<lut.length; i++){
			map.set(i,offset)
			offset += 4+dWordAlign(lut[i].length*2)
		}
		this.size = offset
	}
	get(str:string){
		return this.strings.intern(str)
	}
	write(buffer:Uint8Array, offset:number){
		if(offset&3)
			throw new Error('align error')
		const view = new DataView(buffer.buffer,offset)
		let pos = 0
		for(const s of this.strings.getLut()){
			view.setUint32(pos,s.length,true)
			pos += 4
			for(let i=0; i<s.length; i++){
				view.setUint16(pos,s.charCodeAt(i),true)
				pos += 2
			}
			if(pos&2)
				pos += 2
		}
		if(pos != this.size)
			throw new Error('string section size missmatch')
		return pos
	}
}

class Symbols{
	private lines:number[] = []
	private locals:number[] = []
	private stringStorage = new StringStorage()
	pushLine(offset: number, line: number){
		this.lines.push(offset,line)
	}
	pushLocal(offset: number, sp:number, str:string){
		this.locals.push(offset,sp,this.stringStorage.intern(str))
	}
}

const jumpMap = new Map([
	[Op.JMP_L, Op.JMP],
	[Op.JE_L, Op.JE],
	[Op.JNE_L, Op.JNE]
])

export class Linker{
	private tree:ObjectTree
	private code:number[]
	private offset:number
	private stringStorage:StringStorage
	private symbols = new Symbols()
	constructor(data:CompiledFile[]){
		this.tree = new ObjectTree(data)
		this.stringStorage = new StringStorage(this.tree.size+mmidOffset)
		for(const node of this.tree)
			this.stringStorage.intern(node.name)
		this.code = []
		this.treeInitilizer(this.tree.root)
		for(const func of this.tree.constructors){
			this.pushValue(func.id,Type.FUNCTION)
			this.pushOpc(OpCode.o2(Op.CALL,0))
		}
		this.pushOpc(OpCode.o3(Op.PUSH_CONST,Type.BOOLEAN,1),OpCode.o2(Op.RET))
	}
	link(file:CompiledFile){
		let labels:Map<number,number> = new Map()
		let lookback:number[] = []
		let context:ObjectTreeNode|undefined
		const lut = this.tree.getFileLut(file)!
		const code = file.code
		const opc = new OpCode()
		for(let i=0; i<code.length; i++){
			switch(opc.set(code[i]).op){
				case Op.PUSH_VALUE:{
					let value = code[i+1]
					let type = opc.type
					if(opc.type == Type.STRING){
						value = this.stringStorage.intern(file.strings[value])
					}else if(opc.isType(Type.HASHMAP)){
						value = lut[value].id
						if(opc.type == Type.IMPORT)
							type = lut[value].proxy!.type
					}else if(opc.type == Type.INTEGER && value >= 0xFFFF8000){
						value &= 0xFFFF
					}
					this.pushValue(value,type)
					i += 1
					break
				}case Op.LABEL:
					labels.set(opc.u24,this.offset)
					break
				case Op.LINE:
					this.symbols.pushLine(this.offset,opc.u24)
					break
				case Op.LOCAL:
					this.symbols.pushLocal(this.offset,opc.u24,file.strings[code[++i]])
					break
				case Op.JMP_L:
				case Op.JE_L:
				case Op.JNE_L:{
					const lbl = labels.get(opc.u24)
					const op = jumpMap.get(opc.op)
					if(typeof op == "undefined")
						throw new Error()
					if(typeof lbl == "undefined"){
						lookback.push(this.offset)
						this.pushOpc(OpCode.o2(op,opc.u24))
					}else{
						this.pushOpc(OpCode.o2(op,lbl-this.offset))
					}
					break
				}case Op.PUSH:
					if(!context)
						throw new Error("null context")
					this.pushOpc(...this.resolvePath(file.strings[code[i+1]],context))
					i += 1
					break
				case Op.SET:{
					if(!context)
						throw new Error("null context")
					const path = file.strings[code[i+1]].split('.')
					this.pushOpc(...this.resolvePath(path.slice(0,-1),context))
					const mmid = this.stringStorage.intern(path[path.length-1])
					if(mmid > 0xFFFFFF){
						this.pushOpc(OpCode.o3(Op.PUSH_VALUE,Type.STRING),mmid,OpCode.o2(Op.SET_MEMBER_UNSAFE))
					}else{
						this.pushOpc(OpCode.o2(Op.SET_MEMBER_CONST,mmid))
					}
					i += 1
					break
				}case Op.FUNCTION:{
					this.updateJumps(lookback,labels)
					lookback = []
					labels = new Map()
					context = lut[opc.u24]
					context.address = this.offset
					if(context.proxy)
						context = context.proxy
					break
				}default:
					this.pushOpc(code[i])
			}
		}
		this.updateJumps(lookback,labels)
	}
	buildImage(){
		const stringSection = new StringSection(this.stringStorage)
		const externSection = new ExternSection(this.tree.getExterns())
		const buffer = new Uint8Array(
			headerSize +
			stringSection.size +
			externSection.size +
			this.tree.size*objectSize +
			this.code.length*opCodeSize
		)
		if(buffer.length&3)
			throw new Error('invalid image size')
		let offset = 0
		offset += writeHeader(buffer,this.code.length*opCodeSize,this.tree.size*objectSize,stringSection.size)
		offset += writeCodeSection(buffer,offset,this.code)
		offset += writeObjectSection(buffer,offset,this.tree,stringSection,externSection)
		offset += stringSection.write(buffer,offset)
		offset += externSection.write(buffer,offset)
		if(offset !=buffer.length)
			throw new Error('binery image creation failed')
		return buffer
	}
	private updateJumps(jumps:number[], labels:Map<number,number>){
		const opc = new OpCode()
		for(const offset of jumps){
			opc.set(this.code[offset])
			const lbl = labels.get(opc.u24)
			if(typeof lbl == 'undefined')
				throw new Error()
			this.code[offset] = OpCode.o2(opc.op,lbl-offset)
		}
	}
	private pushOpc(...data:number[]){
		this.code.push(...data)
		this.offset = this.code.length
	}
	private pushValue(value:number,type:Type){
		if(value > 0xFFFF)
			this.pushOpc(OpCode.o3(Op.PUSH_VALUE,type),value)
		else
			this.pushOpc(OpCode.o3(Op.PUSH_CONST,type,value))
	}
	private resolvePath(path:string|string[], context:ObjectTreeNode){
		const pathArray = typeof path === "string" ? path.split('.') : path
		if(pathArray[0] == '')
			return this.dynamicPath(pathArray.slice(1))
		const subpath = this.tree.resolvePath(pathArray,context)
		const code = subpath.ctx.id > 0xFFFF ?
			[OpCode.o3(Op.PUSH_VALUE,subpath.ctx.type),subpath.ctx.id] :
			[OpCode.o3(Op.PUSH_CONST,subpath.ctx.type,subpath.ctx.id)]
		code.push(...this.dynamicPath(subpath.path))
		return code
	}
	private dynamicPath(path:string[]){
		const code:number[] = []
		for(const name of path){
			if(name == 'parent'){
				code.push(OpCode.o2(Op.PUSH_PARENT))
			}else{
				const mmid = this.stringStorage.intern(name)
				if(mmid > 0xFFFFFF){
					code.push(OpCode.o3(Op.PUSH_VALUE,Type.STRING),mmid,OpCode.o2(Op.PUSH_MEMBER_UNSAFE))
				}else{
					code.push(OpCode.o2(Op.PUSH_MEMBER_CONST,mmid))
				}
			}
		}
		return code
	}
	private treeInitilizer(node:ObjectTreeNode){
		if(node.type == Type.IMPORT || node.children.size == 0)
			return
		this.pushValue(node.id,node.type)
		if(node.children.size > 1)
			this.pushOpc(OpCode.o2(Op.DUP,node.children.size-1))
		for(const child of node.children.values()){
			if(child.type == Type.IMPORT)
				this.pushValue(child.proxy!.id,child.proxy!.type)
			else
				this.pushValue(child.id,child.type)
			const mmid = this.stringStorage.intern(child.name)
			if(mmid > 0xFFFFFF){
				this.pushOpc(OpCode.o3(Op.PUSH_VALUE,Type.STRING),mmid,OpCode.o2(Op.SET_MEMBER_UNSAFE))
			}else{
				this.pushOpc(OpCode.o2(Op.SET_MEMBER_CONST,mmid))
			}
		}
		for(const child of node.children.values())
			this.treeInitilizer(child)
	}
}
