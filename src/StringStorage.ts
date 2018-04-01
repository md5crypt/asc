export default class StringStorage{
	private map:Map<string,number> = new Map()
	private lut:string[] = []
	private offset: number
	constructor(offset?:number){
		this.offset = offset || 0
	}
	intern(str:string){
		const s = this.map.get(str)
		if(typeof s != 'undefined')
			return s
		const id = this.lut.length+this.offset
		this.map.set(str,id)
		this.lut.push(str)
		return id
	}
	softIntern(str:string){
		return this.map.get(str)
	}
	get(n:number){
		return this.lut[n]
	}
	getLut(){
		return this.lut
	}
	getOffset(){
		return this.offset
	}
}
