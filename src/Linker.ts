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
	sourceFile: string
}

interface ObjectTreeNode{
	id: number
	name: string
	nameid?: number
	type: Type
	children: Map<string,ObjectTreeNode>
	file?: CompiledFile
	parent?: ObjectTreeNode
	address?: number
	proxy?: ObjectTreeNode
}

function dWordAlign(addr:number){
	return addr + ((addr&3) ? 4-(addr&3) : 0)
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
		const scopes:ObjectTreeNode[] = []
		for(const file of data){
			const lut:ObjectTreeNode[] = []
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
					id: 0
				}
				lut.push(o)
				switch(metadata.type){
					case Type.IMPORT:
						imports.push(o)
						break
					case Type.STUB:
						if(typeof metadata.parent == 'undefined')
							localroot = o
						break
					case Type.SCOPE:
						o.id = id++
						this.nodes.push(o)
						/* falls through */
					case Type.SCOPESTUB:
						scopes.push(o)
						break
					case Type.EXTERN:
						o.id = id++
						this.nodes.push(o)
						if(typeof metadata.address == 'undefined')
							throw new Error('invalid extern')
						o.address = this.externs.intern(file.strings[metadata.address])
						break
					default:
						o.id = id++
						this.nodes.push(o)
						if(typeof metadata.parent == 'undefined')
							localroot = o
				}
			}
			for(let i=0; i<file.objects.length; i++){
				const metadata = file.objects[i]
				const o = lut[i]
				o.parent = (typeof metadata.parent == 'undefined')?base:lut[metadata.parent]
				if(o.parent == localroot)
					o.parent = base
				if(o != localroot && o.type != Type.SCOPE && o.type != Type.SCOPESTUB){
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
		this.evaulateLoop(imports,scopes)
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
			case 'self': return this.resolvePathAbs(path.slice(1), (context.type == Type.EVENT) ? context.parent! : context)
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
	private evaulateLoop(imports:ObjectTreeNode[],scopes:ObjectTreeNode[]){
		let iarr = imports
		let sarr = scopes
		while(true){
			const ilen = iarr.length
			const slen = sarr.length
			iarr = this.evaulateImports(imports)
			sarr = this.evaulateScopes(scopes)
			if(iarr.length + sarr.length == 0)
				break
			if(iarr.length == ilen && sarr.length == slen){
				throw new Error(`Failed to resolve path "${(ilen?iarr[0]:sarr[0]).name}"`)
			}
		}
	}
	private evaulateImports(imports:ObjectTreeNode[]){
		const failed = [] as ObjectTreeNode[]
		for(const o of imports){
			let src
			try{
				src = this.resolvePath(o.name.split('.'),o.parent || this.root)
			}catch(e){
				failed.push(o)
				continue
			}
			if(src.path.length != 0){
				failed.push(o)
			}else{
				o.id = src.ctx.id
				o.children = src.ctx.children
				o.name = src.ctx.name
				o.proxy = src.ctx
			}
		}
		return failed
	}
	private evaulateScopes(scopes:ObjectTreeNode[]){
		const failed:ObjectTreeNode[] = []
		for(const o of scopes){
			let src
			try{
				src = this.resolvePath(o.name.split('.'),o.parent || this.root)
			}catch(e){
				failed.push(o)
				continue
			}
			if(src.path.length != 0){
				failed.push(o)
			}else{
				const target = src.ctx
				for(const child of o.children.values()){
					child.parent = target
					if(target.children.has(child.name))
						throw new Error(`link error, object '${child.name}' redefined`)
					target.children.set(child.name,child)
				}
				o.proxy = target
				o.name = o.name.split('.').pop()! + '@scope'
				o.children = new Map()
			}
		}
		return failed
	}
}

class Symbols{
	lines:number[] = []
	files:number[] = []
	functions:number[] = []
	//locals:number[] = []
	stringStorage = new StringStorage()
	pushFunction(offset: number, id: number){
		this.functions.push(offset,id)
	}
	pushFile(offset: number, str: string){
		this.files.push(offset,this.stringStorage.intern(str))
	}
	pushLine(offset: number, line: number){
		if(this.lines[this.lines.length-1] == line)
			this.lines[this.lines.length-2] = offset
		else
			this.lines.push(offset,line)
	}
	//pushLocal(offset: number, sp:number, str:string){
	//	this.locals.push(offset,sp,this.stringStorage.intern(str))
	//}
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
		this.offset = 0
		this.tree = new ObjectTree(data)
		this.stringStorage = new StringStorage(this.tree.size+mmidOffset)
		for(const node of this.tree)
			node.nameid = this.stringStorage.intern(node.name)
		this.code = [OpCode.o2(Op.JMP, 2), OpCode.o2(Op.JMP, 0)]
		this.treeInitilizer(this.tree.root)
		this.pushOpc(OpCode.o3(Op.PUSH_CONST,Type.BOOLEAN,1),OpCode.o2(Op.RET))
		this.code[1] = OpCode.o2(Op.JMP, this.code.length - 1)
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
		this.symbols.pushFile(this.offset,file.sourceFile)
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
					}
					if(opc.type == Type.INTEGER) {
						if (value < 0x8000) {
							this.pushOpc(OpCode.o3(Op.PUSH_CONST,Type.INTEGER,value))
						} else if (value >= 0xFFFF8000) {
							this.pushOpc(OpCode.o3(Op.PUSH_CONST,Type.INTEGER,value&0xFFFF))
						} else {
							this.pushOpc(OpCode.o3(Op.PUSH_VALUE,Type.INTEGER),value)
						}
					} else {
						this.pushValue(value,type)
					}
					i += 1
					break
				}case Op.LABEL:
					labels.set(opc.u24,this.offset)
					break
				case Op.LINE:
					this.symbols.pushLine(this.offset,opc.u24)
					break
				case Op.LOCAL:
					i += 1
					//this.symbols.pushLocal(this.offset,opc.u24,file.strings[code[++i]])
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
					if(path.length == 1)
						throw new Error(`set ${path[0]}: no container specifed`)
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
					this.symbols.pushFunction(this.offset,context.id)
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
		const sections:Section[] = [
			new Section("PROGMEM",this.code),
			new Section("SHIFT",[mmidOffset]),
			new StringSection(this.tree.getExterns(),"EXTERN"),
			new ObjectSection(this.tree),
			new StringSection(this.stringStorage,"STRING"),
			new StringSection(this.symbols.stringStorage,"SYM_STRING"),
			new Section("SYM_FILE",this.symbols.files),
			new Section("SYM_FUNC",this.symbols.functions),
			new Section("SYM_LINE",this.symbols.lines)
		]
		const data = new Uint8Array(sections.map(x=>x.size).reduce((a,b)=>a+b)+4)
		const view = new DataView(data.buffer)
		view.setUint32(0,0x00425341,true)
		let offset = 4
		for(const section of sections){
			data.set(section.data,offset)
			offset += section.size
		}
		return data
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
		//this.pushValue(node.id,node.type)
		//if(node.children.size > 1)
		//	this.pushOpc(OpCode.o2(Op.DUP,node.children.size-1))
		for(const child of node.children.values()){
			if(child.proxy)
				this.pushValue(child.proxy.id,child.proxy.type)
			else
				this.pushValue(child.id,child.type)
			this.pushValue(node.id,node.type)
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

class Section{
	private mem: Uint8Array
	protected view: DataView
	protected uint32View: Uint32Array
	protected uint8View: Uint8Array
	constructor(name: string, data: ArrayBuffer|number[]|number){
		if(name.length > 16)
			throw new Error(`section name "${name}" to long`)
		let size:number
		if(typeof data == 'number')
			size = data
		else if(data instanceof ArrayBuffer)
			size = data.byteLength
		else
			size = data.length*4
		const mem = new Uint8Array(dWordAlign(size) + 20)
		const view = new DataView(mem.buffer)
		mem.set(Buffer.from(name,'ascii'))
		view.setUint32(16,size,true)
		if(data instanceof ArrayBuffer)
			mem.set(new Uint8Array(data),20)
		else if(typeof data == "object")
			mem.set(new Uint8Array(new Uint32Array(data).buffer),20)
		this.uint8View = new Uint8Array(mem.buffer,20)
		this.uint32View = new Uint32Array(mem.buffer,20)
		this.view = new DataView(mem.buffer,20)
		this.mem = mem
	}
	get size(){
		return this.data.length
	}
	get data(){
		return this.mem
	}
}

class StringSection extends Section{
	constructor(strings:StringStorage,name:string){
		const lut = strings.getLut()
		let size = 0
		for(const s of lut)
			size += 4+dWordAlign(s.length*2)
		super(name,size+4)
		let offset = 4
		this.view.setUint32(0,lut.length,true)
		for(const s of lut){
			this.view.setUint32(offset,s.length,true)
			this.uint8View.set(Buffer.from(s,'utf16le'),offset+4)
			offset += 4 + dWordAlign(s.length*2)
		}
	}
}

class ObjectSection extends Section{
	constructor(tree:ObjectTree){
		super("OBJECT",tree.size*16)
		const u32 = this.uint32View
		let pos = 0
		for(const o of tree){
			u32[pos+0] = o.type
			u32[pos+1] = o.nameid!
			u32[pos+2] = o.parent?o.parent.id:0
			u32[pos+3] = (typeof o.address == 'undefined')?0xFFFFFFFF:o.address
			pos += 4
		}
	}
}
