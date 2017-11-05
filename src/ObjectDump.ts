import {OpCode,Op,Type} from "./OpCode"
import {ObjectMetadata} from "./Compiler"

abstract class ProgramData{
	private code: Uint32Array
	protected objects:ObjectMetadata[]
	protected strings:string[]
	protected names:string[]
	constructor(code: Uint32Array,objects:ObjectMetadata[],strings:string[]){
		this.code = code
		this.objects = objects
		this.strings = strings
		const names:string[] = []
		for(let node of objects){
			const path = (node.parent && node.parent!=0xFFFFFFFF)?[]:[node.name]
			while(node.parent && node.parent != 0xFFFFFFFF){
				path.unshift(node.name)
				node = this.getObject(node.parent)
			}
			names.push(path.map(x=>this.getString(x)).join('.'))
		}
		this.names = names
	}
	print(){
		this.printExterns()
		this.printObjects()
		this.printCode()
	}
	abstract getObjectName(id:number): string
	abstract getObject(id:number): ObjectMetadata
	abstract getString(id:number): string
	abstract getExtern(id:number): string
	private printExterns(){
		let nl = false
		for(let i=0; i<this.objects.length; i++){
			const node = this.objects[i]
			if(node.type == Type.EXTERN){
				if(typeof node.address == 'undefined')
					throw new Error('invalid extern')
				console.log(`extern '${this.getExtern(node.address)}' bind to ${this.names[i]}`)
				nl = true
			}
		}
		if(nl)
			console.log()
	}
	private printObjects(){
		for(let i=0; i<this.objects.length; i++){
			const node = this.objects[i]
			console.log(`def object ${this.names[i]}:${OpCode.getTypeName(node.type)} `+((node.parent&&node.parent!=0xFFFFFFFF)?`child of ${this.getObjectName(node.parent)}`:'as root'))
		}
		if(this.objects.length > 0)
			console.log()
	}
	private printCode(){
		const functions = this.objects
			.filter(o=>typeof o.address != 'undefined' && o.address!=0xFFFFFFFF && o.type != Type.EXTERN)
			.sort((a,b)=><number>a.address-<number>b.address)
		const labels = this.buildLabelIndex()
		const labelMap:Map<number,number> = new Map()
		const opc = new OpCode()
		const code = this.code
		labels.forEach((l,i)=>labelMap.set(l,i))
		for(let i=0; i<code.length; i++){
			const offset = i.toString(16).toUpperCase().padStart(4,'0')
			if(functions.length && i >= <number>functions[0].address){
				console.log(`\n${this.names[this.objects.indexOf(functions[0])]}`)
				functions.shift()
			}
			if(labels.length && i >= labels[0]){
				console.log(`label ${labelMap.get(i)}:`)
				labels.shift()
			}
			switch(opc.set(code[i]).op){
				case Op.PUSH_LOCAL:
				case Op.SET_LOCAL:
					console.log(`${offset}: ${opc.getOpName()} ${opc.s24}`)
					break
				case Op.DEALLOC:
				case Op.ALLOC:
				case Op.CALL:
				case Op.CALL_UNSAFE:
				case Op.ASSERT_ARRITY_EQ:
				case Op.ASSERT_ARRITY_GE:
				case Op.SET_ARRITY_EQ:
				case Op.SET_ARRITY_GE:
				case Op.JMP_L:
				case Op.JE_L:
				case Op.JNE_L:
					console.log(`${offset}: ${opc.getOpName()} ${opc.u24}`)
					break
				case Op.PUSH_VALUE:
					console.log(`${offset}: ${opc.getOpName()} ${this.valueOf(code[++i],opc.type)}`)
					break
				case Op.PUSH_CONST:
					console.log(`${offset}: ${opc.getOpName()} ${this.valueOf(opc.u16,opc.type)}`)
					break
				case Op.PUSH_MEMBER_CONST:
				case Op.SET_MEMBER_CONST:
					console.log(`${offset}: ${opc.getOpName()} '${this.getString(opc.u24)}'`)
					break
				case Op.CHKTYPE:
					console.log(`${offset}: ${opc.getOpName()} ${opc.getTypeName()}`)
					break
				case Op.ASSERT_TYPE:
				case Op.ASSERT_ARG_TYPE:
					console.log(`${offset}: ${opc.getOpName()} ${opc.s16}, ${opc.getTypeName()}`)
					break
				case Op.JMP:
				case Op.JE:
				case Op.JNE:
					console.log(`${offset}: ${opc.getOpName()} ${opc.s24} (label ${labelMap.get(i+opc.s24)})`)
					break
				case Op.PUSH:
				case Op.SET:
					console.log(`${offset}: ${opc.getOpName()} ${this.getString(code[++i])}`)
					break
				case Op.FUNCTION:
					console.log(`\n${opc.getOpName()} ${this.getObjectName(opc.u24)}`)
					break
				case Op.LABEL:
					console.log(`${opc.getOpName()} ${opc.s24}:`)
					break
				case Op.LOCAL:
					console.log(`${offset}: *${opc.getOpName()} ${this.getString(code[++i])}, ${opc.s24}`)
					break
				case Op.LINE:
					console.log(`${offset}: *${opc.getOpName()} ${opc.s24}`)
					break
				default:
					console.log(`${offset}: ${opc.getOpName()}`)
			}
		}
	}
	private valueOf(value:number, type:Type){
		if(type == Type.STRING)
			return `'${this.getString(value)}':string`
		if(type == Type.INTEGER)
			return `${value}:integer`
		if(type == Type.FLOAT){
			const view = new DataView(new ArrayBuffer(4))
			view.setUint32(0,value)
			return `${view.getFloat32(0)}:float`
		}
		if(type == Type.BOOLEAN){
			return `${!!value}:boolean`
		}
		if(OpCode.isType(type,Type.OBJECT))
			return `${this.getObjectName(value)}:${OpCode.getTypeName(type)}`
		return `:${OpCode.getTypeName(type)}`
	}
	private buildLabelIndex(){
		const labels:number[] = []
		const opc = new OpCode
		for(let i=0; i<this.code.length; i++){
			switch(opc.set(this.code[i]).op){
				case Op.JMP:
				case Op.JE:
				case Op.JNE:
					labels.push(i+opc.s24)
					break
				default:
					if(opc.isDWord())
						i += 1
					break
			}
		}
		return labels.sort((a,b)=>a-b)
	}
}

export class ObjectFile extends ProgramData{
	getObject(id:number){
		if(id < this.objects.length)
			return this.objects[id]
		throw new Error('object oob')
	}
	getObjectName(id:number){
		if(id < this.names.length)
			return this.names[id]
		throw new Error('object oob')
	}
	getString(id:number){
		if(id < this.strings.length)
			return this.strings[id]
		throw new Error('string oob')
	}
	getExtern(id:number){
		return this.getString(id)
	}
}

function readObjects(data:Buffer){
	const u32 = new Uint32Array(data.buffer,data.byteOffset,data.byteLength>>2)
	const objects:ObjectMetadata[] = []
	for(let i=0; i<u32.length; i+=4){
		objects.push({
			type: u32[i],
			name: u32[i+1],
			parent: u32[i+2],
			address: u32[i+3]
		})
	}
	return objects
}

function readStrings(data:Buffer){
	const strings:string[] = []
	if(data.length == 0)
		return []
	const u16 = new Uint16Array(data.buffer,data.byteOffset,data.byteLength>>1)
	const u32 = new Uint32Array(data.buffer,data.byteOffset,data.byteLength>>2)
	let offset = 0
	while(offset < u32.length){
		const len = u32[offset++]
		strings.push(String.fromCharCode(...u16.subarray(offset*2,offset*2+len)))
		offset += (len+(len&1))/2
	}
	return strings
}

function readExterns(data:Buffer){
	const strings =  String(data).split('\0')
	const map:Map<number,string> = new Map()
	let offset = 0
	for(const s of strings){
		map.set(offset,s)
		offset += s.length+1
	}
	return map
}

export class ImageFile extends ProgramData{
	externs:Map<number,string>
	constructor(data:Buffer){
		const magicDWord = 0xB5006BB1
		const u32 = new Uint32Array(data.buffer,data.byteOffset,data.byteLength>>2)
		if(u32[0] != magicDWord)
			throw new Error('invalid magic dword in header')
		const codeSectionSize = u32[1]
		const objectSectionSize = u32[2]
		const stringSectionSize = u32[3]
		let offset = 16
		const code = new Uint32Array(data.buffer,data.byteOffset+offset,codeSectionSize>>2)
		offset += codeSectionSize
		const objects = readObjects(data.slice(offset,offset+objectSectionSize))
		offset += objectSectionSize
		const strings = readStrings(data.slice(offset,offset+stringSectionSize))
		offset += stringSectionSize
		const externs = readExterns(data.slice(offset))
		super(code,objects,strings)
		this.externs = externs
	}
	getObject(id:number){
		if(id <= this.objects.length)
			return this.objects[id-1]
		throw new Error('object oob')
	}
	getObjectName(id:number){
		if(id <= this.names.length)
			return this.names[id-1]
		throw new Error('object oob')
	}
	getString(id:number){
		if(id > this.objects.length && id <= this.objects.length+this.strings.length)
			return this.strings[id-this.objects.length-1]
		throw new Error('string oob')
	}
	getExtern(id:number){
		const s = this.externs.get(id)
		if(typeof s == 'undefined')
			throw new Error('unknown extern')
		return s
	}
}
