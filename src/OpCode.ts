import * as vm from './vmConstants'
export {Type,Op} from './vmConstants'

const dWordOpList = new Set([
	vm.Op.PUSH,
	vm.Op.SET,
	vm.Op.PUSH_VALUE,
	vm.Op.LOCAL
])

const typeMap = vm.typeLut.reduce((a,b,i)=>a.set(b,i),new Map() as Map<string,number>)

export class OpCode{
	raw: number
	static o2(op:vm.Op, value?:number){
		return ((op << 24) | ((value||0)&0xFFFFFF)) >>> 0
	}
	static o3(op:vm.Op, type:vm.Type, value?:number){
		return ((op << 24) | (type << 16) | ((value||0)&0xFFFF)) >>> 0
	}
	static isType(child:vm.Type, parent:vm.Type){
		return vm.typeMatrix[vm.typeLut.length*child + parent] == 1
	}
	static getTypeName(type:vm.Type){
		return vm.typeLut[type]
	}
	static getOpName(op:vm.Op){
		return vm.opLut[op]
	}
	static getTypeByName(type:string){
		return typeMap.get(type)
	}
	constructor(raw?:number){
		this.raw = raw||0
	}
	isType(type:vm.Type){
		return vm.typeMatrix[vm.typeLut.length*this.type + type] == 1
	}
	getTypeName(){
		return vm.typeLut[this.type]
	}
	getOpName(){
		return vm.opLut[this.op]
	}
	isDWord(){
		return dWordOpList.has(this.op)
	}
	set(raw:number){
		this.raw = raw
		return this
	}
	get type(): vm.Type{
		return (this.raw>>>16)&0xFF
	}
	get s24(){
		return this.raw&0x800000?-((this.raw&0xFFFFFF)^0xFFFFFF)-1:this.raw&0xFFFFFF
	}
	get u24(){
		return this.raw&0xFFFFFF
	}
	get s16(){
		return this.raw&0x8000?-((this.raw&0xFFFF)^0xFFFF)-1:this.raw&0xFFFF
	}
	get u16(){
		return this.raw&0xFFFF
	}
	get op(): vm.Op{
		return this.raw>>>24
	}
}

export default OpCode
