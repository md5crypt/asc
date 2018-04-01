import {OpCode,Op,Type} from "./OpCode"
import {ObjectMetadata} from "./Compiler"

abstract class ProgramData{
	private code: Uint32Array
	protected objects:ObjectMetadata[]
	protected strings:string[]
	protected names:string[]
	protected mmidOffset:number
	constructor(code: Uint32Array,objects:ObjectMetadata[],strings:string[],mmidOffset?:number){
		this.code = code
		this.mmidOffset = mmidOffset || 0
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
			console.log(`def object[${i+this.mmidOffset}] ${this.names[i]}:${OpCode.getTypeName(node.type)} `+((node.parent&&node.parent!=0xFFFFFFFF)?`child of ${this.getObjectName(node.parent)}`:'as root'))
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
				console.log(`\nfunction ${this.names[this.objects.indexOf(functions[0])]}`)
				functions.shift()
			}
			if(labels.length && i >= labels[0]){
				console.log(`[label#${labelMap.get(i)}]`)
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
				case Op.SET_ARRITY:
				case Op.PUSH_ARGUMENT_COUNT:
				case Op.PUSH_ARGUMENT_ARRAY:
				case Op.DUP:
					console.log(`${offset}: ${opc.getOpName()} ${opc.u24}`)
					break
				case Op.JMP_L:
				case Op.JE_L:
				case Op.JNE_L:
					console.log(`${offset}: ${opc.getOpName()} label#${opc.u24}`)
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
				case Op.ISTYPE:
					console.log(`${offset}: ${opc.getOpName()} ${opc.getTypeName()}`)
					break
				case Op.ASSERT_TYPE:
				case Op.ASSERT_ARG_TYPE:
					console.log(`${offset}: ${opc.getOpName()} ${opc.s16}, ${opc.getTypeName()}`)
					break
				case Op.JMP:
				case Op.JE:
				case Op.JNE:
					console.log(`${offset}: ${opc.getOpName()} label#${labelMap.get(i+opc.s24)}`)
					break
				case Op.PUSH:
				case Op.SET:
					console.log(`${offset}: ${opc.getOpName()} ${this.getString(code[++i])}`)
					break
				case Op.FUNCTION:
					console.log(`\n${opc.getOpName()} ${this.getObjectName(opc.u24)}`)
					break
				case Op.LABEL:
					console.log(`[${opc.getOpName()}#${opc.s24}]`)
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
			view.setUint32(0,value,true)
			return `${view.getFloat32(0,true)}:float`
		}
		if(type == Type.BOOLEAN){
			return `${!!value}:boolean`
		}
		if(OpCode.isType(type,Type.HASHMAP))
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

class ImageReader{
	[key:string]: any
	mmidOffset: number
	code: Uint32Array
	objects: ObjectMetadata[]
	strings: string[]
	externs: string[]
	private static readStrings(data: Uint8Array){
		const buffer = Buffer.from(data.buffer as ArrayBuffer,data.byteOffset,data.byteLength)
		let offset = 4
		const output:string[] = []
		while(offset < data.length){
			const size = buffer.readUInt32LE(offset,true)
			output.push(buffer.slice(offset+4,offset+4+size*2).toString('utf16le'))
			offset += 4 + (size+(size&1))*2
		}
		return output
	}
	protected sectionString(data: Uint8Array){
		this.strings = ImageReader.readStrings(data)
	}
	protected sectionExtern(data: Uint8Array){
		this.externs = ImageReader.readStrings(data)
	}
	protected sectionProgmem(data: Uint8Array){
		this.code = new Uint32Array(data.buffer,data.byteOffset,data.byteLength>>2)
	}
	protected sectionObject(data: Uint8Array){
		const uint32View = new Uint32Array(data.buffer,data.byteOffset,data.byteLength>>2)
		const objects:ObjectMetadata[] = []
		for(let i=0; i<uint32View.length; i+=4){
			objects.push({
				type: uint32View[i],
				name: uint32View[i+1],
				parent: uint32View[i+2],
				address: uint32View[i+3]
			})
		}
		this.objects = objects
	}
	protected sectionShift(data: Uint8Array){
		const view = new DataView(data.buffer,data.byteOffset,data.byteLength)
		this.mmidOffset = view.getUint32(0,true)
	}
	constructor(data: Buffer){
		const magicDWord = 0x00425341
		if(data.readUInt32LE(0,true) != magicDWord)
			throw new Error('invalid magic dword in header')
		let offset = 4
		while(offset < data.byteLength){
			const name = data.slice(offset,offset+16)
				.toString('ascii')
				.replace(/\0/g,'')
				.toLowerCase()
				.replace(/(?:^|_)(.)/g,(_,group:string)=>group.toUpperCase())
			offset += 16
			const size = data.readUInt32LE(offset,true)
			offset += 4
			if('section'+name in this){
				this['section'+name](data.subarray(offset,offset+size))
			}else{
				console.info(`skipping section "${name}"`)
			}
			offset += size
		}
	}
}

export class ImageFile extends ProgramData{
	externs:string[]
	constructor(data:Buffer){
		const image = new ImageReader(data)
		super(image.code,image.objects,image.strings,image.mmidOffset)
		this.externs = image.externs
	}
	getObject(id:number){
		if(id-this.mmidOffset < this.objects.length)
			return this.objects[id-this.mmidOffset]
		throw new Error('object oob')
	}
	getObjectName(id:number){
		if(id-this.mmidOffset < this.names.length)
			return this.names[id-this.mmidOffset]
		throw new Error('object oob')
	}
	getString(id:number){
		const p = id-this.mmidOffset
		if(p >= this.objects.length && p < this.objects.length+this.strings.length)
			return this.strings[p-this.objects.length]
		throw new Error('string oob')
	}
	getExtern(id:number){
		const s = this.externs[id]
		if(typeof s == 'undefined')
			throw new Error('unknown extern')
		return s
	}
}
