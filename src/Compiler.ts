import {OpCode,Op,Type} from './Opcode'
import StringStorage from './StringStorage'

const expressionMap = new Map(Object.entries({
	'|':Op.BOR,'^':Op.BXOR,'&':Op.BAND,'==':Op.EQ,'===':Op.EQEQ,'!=':Op.NEQ,'!==':Op.NEQNEQ,
	'<':Op.LT,'<=':Op.LE,'>':Op.GT,'>=':Op.GE,'<<':Op.SHR,'>>':Op.SHL,'+':Op.ADD,
	'-':Op.SUB,'*':Op.MUL,'/':Op.DIV,'%':Op.MOD,'!':Op.NOT,'~':Op.BNOT,'~~':Op.NEG
}))

export interface LexerLocation{
	first_line: number
	last_line: number
	first_column: number
	last_column: number
	range: number[]
}

export class CompilerError extends Error{
	hash:{line?:number, loc:LexerLocation}
	constructor(tok:LexerLocation, msg:string){
		super(msg)
		const ln = tok.first_line
		this.hash = {'line':isNaN(ln)?undefined:ln-1,'loc':tok}
	}
}

export interface ObjectMetadata{
	name: number
	type: Type
	parent?: number
	address?: number
}

interface Argument{
	name: string
	type?: string
	optional?: boolean
	variadic?: boolean
}

export class Compiler{
	private objects: ObjectMetadata[] = []
	private code: number[][] = []
	private stringStorage = new StringStorage()
	reset(){
		this.objects = []
		this.code = []
		this.stringStorage = new StringStorage()
	}
	wrapBlock(block?: number[]){
		if(block && block.length > 0){
			block.unshift(OpCode.o2(Op.BLKOPEN))
			block.push(OpCode.o2(Op.BLKCLOSE))
		}
		return block
	}
	atom(str:string){
		if(str == 'false')
			return [OpCode.o3(Op.PUSH_CONST,Type.BOOLEAN,0)]
		if(str == 'true')
			return [OpCode.o3(Op.PUSH_CONST,Type.BOOLEAN,1)]
		return [OpCode.o3(Op.PUSH_CONST,Type.UNDEFINED,0)]
	}
	number(tok:LexerLocation, str:string){
		const n = parseFloat(str)
		if(isNaN(n) || n == Infinity || n == -Infinity)
			throw new CompilerError(tok,"'"+str+"' equlas to "+n)
		if(n == Math.floor(n)){
			if(isNaN(n) || n == Infinity || n == -Infinity)
				throw new CompilerError(tok,`'${str}' equlas to ${n}`)
			if(n > 0x7FFFFFFF || n < -2147483648)
				throw new CompilerError(tok,`'${str}' overflows uint32_t`)
			return [OpCode.o3(Op.PUSH_VALUE,Type.INTEGER),n]
		}
		const view = new DataView(new ArrayBuffer(4))
		view.setFloat32(0,n,true)
		return [OpCode.o3(Op.PUSH_VALUE,Type.FLOAT),view.getUint32(0,true)]
	}
	hex(tok:LexerLocation, str:string){
		const n = parseInt(str.slice(2),16)
		if(isNaN(n) || n == Infinity || n == -Infinity)
			throw new CompilerError(tok,`'${str}' equlas to ${n}`)
		if(n > 0x7FFFFFFF || n < -2147483648)
			throw new CompilerError(tok,`'${str}' overflows uint32_t`)
		return [OpCode.o3(Op.PUSH_VALUE,Type.INTEGER),n]
	}
	bin(tok:LexerLocation, str:string){
		const n = parseInt(str.slice(2),2)
		if(isNaN(n) || n == Infinity || n == -Infinity)
			throw new CompilerError(tok,`'${str}' equlas to ${n}`)
		if(n > 0x7FFFFFFF || n < -2147483648)
			throw new CompilerError(tok,`'${str}' overflows uint32_t`)
		return [OpCode.o3(Op.PUSH_VALUE,Type.INTEGER),n]
	}
	array(tok:LexerLocation, args:number[][]){
		const o = [OpCode.o3(Op.PUSH_VALUE,Type.INTEGER),args.length].concat(...args.reverse())
		o.push(
			OpCode.o2(Op.PUSH),this.stringStorage.intern('array'),
			OpCode.o2(Op.CALL,args.length+1),
			OpCode.o2(Op.LINE,tok.first_line)
		)
		return o
	}
	varname(tok:LexerLocation, str:string){
		return [
			OpCode.o2(Op.PUSH),
			this.stringStorage.intern(str),
			OpCode.o2(Op.LINE,tok.first_line)
		]
	}
	string(str:string){
		return [
			OpCode.o3(Op.PUSH_VALUE,Type.STRING),
			this.stringStorage.intern(str)
		]
	}
	whileBlock(tok:LexerLocation, expression:number[], body:number[]){
		expression.unshift(OpCode.o2(Op.LABEL,0))
		expression.push(OpCode.o2(Op.JNE_L,1), OpCode.o2(Op.LINE,tok.first_line))
		const opc = new OpCode()
		for(let i=0; i<body.length; i++){
			switch(opc.set(body[i]).op){
				case Op.BREAK:
					expression.push(OpCode.o2(Op.JMP_L,1))
					break
				case Op.CONTINUE:
					expression.push(OpCode.o2(Op.JMP_L,0))
					break
				default:
					expression.push(body[i])
					if(opc.isDWord())
						expression.push(body[++i])
				}
		}
		expression.push(OpCode.o2(Op.JMP_L,0),OpCode.o2(Op.LABEL,1))
		return this.wrapBlock(expression) as Number[]
	}
	ifBlock(tok:LexerLocation, expression:number[], iftrue:number[], iffalse?:number[]){
		if(iffalse){
			expression.push(OpCode.o2(Op.JNE_L,0),OpCode.o2(Op.LINE,tok.first_line))
			expression.push(...iftrue)
			expression.push(OpCode.o2(Op.JMP_L,1),OpCode.o2(Op.LABEL,0))
			expression.push(...iffalse)
			expression.push(OpCode.o2(Op.LABEL,1))
		}else{
			expression.push(OpCode.o2(Op.JNE_L,0),OpCode.o2(Op.LINE,tok.first_line))
			expression.push(...iftrue)
			expression.push(OpCode.o2(Op.LABEL,0))
		}
		return this.wrapBlock(expression) as Number[]
	}
	expression(tok:LexerLocation, op:string, left?:number[], right?:number[]){
		if(op == '&&' || op == '||'){
			if(!left || !right)
				throw new CompilerError(tok,`invalid short-circut expression`)
			//short-circut implementation
			left.push(OpCode.o2(Op.DUP))
			if(op == '||')
				left.push(OpCode.o2(Op.JE_L,0))
			else
				left.push(OpCode.o2(Op.JNE_L,0))
			left.push(OpCode.o2(Op.DEALLOC,1))
			left.push(...right)
			left.push(OpCode.o2(Op.LABEL,0),OpCode.o2(Op.LINE,tok.first_line))
			return this.wrapBlock(left) as number[]
		}
		const o:number[] = []
		if(left)
			o.push(...left)
		if(right)
			o.push(...right)
		const operator = expressionMap.get(op)
		if(!operator)
			throw new CompilerError(tok,`invalid operator '${operator}'`)
		o.push(OpCode.o2(operator,OpCode.o2(Op.LINE,tok.first_line)))
		return o
	}
	callExpression(tok:LexerLocation, args: number[][]){
		const o = (args.length>1)?([] as number[]).concat(...args.slice(1).reverse()):[]
		o.push(...args[0])
		o.push(OpCode.o2(Op.CALL,args.length-1),OpCode.o2(Op.LINE,tok.first_line))
		return o
	}
	index(tok:LexerLocation, object:number[], key:number[]){
		object.push(...key,OpCode.o2(Op.PUSH_MEMBER),OpCode.o2(Op.LINE,tok.first_line))
		return object
	}
	continue(tok:LexerLocation){
		return [OpCode.o2(Op.CONTINUE),OpCode.o2(Op.LINE,tok.first_line)]
	}
	break(tok:LexerLocation){
		return [OpCode.o2(Op.BREAK),OpCode.o2(Op.LINE,tok.first_line)]
	}
	throw(tok:LexerLocation, val?:number[]){
		if(!val)
			return [OpCode.o3(Op.PUSH_CONST,Type.UNDEFINED,0),OpCode.o2(Op.THROW)]
		val.push(OpCode.o2(Op.THROW),OpCode.o2(Op.LINE,tok.first_line))
		return val
	}
	yield(tok:LexerLocation, val?:number[]){
		if(!val)
			return [OpCode.o3(Op.PUSH_CONST,Type.UNDEFINED,0),OpCode.o2(Op.YIELD)]
		val.push(OpCode.o2(Op.YIELD),OpCode.o2(Op.LINE,tok.first_line))
		return val
	}
	return(tok:LexerLocation, val?:number[]){
		if(!val)
			return [OpCode.o3(Op.PUSH_CONST,Type.UNDEFINED,0),OpCode.o2(Op.RET)]
		val.push(OpCode.o2(Op.RET),OpCode.o2(Op.LINE,tok.first_line))
		return val
	}
	call(tok:LexerLocation, name:number[]|string, args:number[][]){
		const o = ([] as number[]).concat(...args.reverse())
		if(typeof name === 'object')
			o.push(...name)
		else
			o.push(OpCode.o2(Op.PUSH),this.stringStorage.intern(name))
		o.push(OpCode.o2(Op.CALL,args.length),OpCode.o2(Op.LINE,tok.first_line),OpCode.o2(Op.DEALLOC,1))
		return o
	}
	local(tok:LexerLocation, name:string, value?:number[]){
		if(name.indexOf('.')>=0)
			throw new CompilerError(tok,`'${name}' contains a '.' character and thus can not be used as a local`)
		const intern = this.stringStorage.intern(name)
		const o = [OpCode.o2(Op.LOCAL),intern]
		if(value){
			o.push(...value)
			o.push(OpCode.o2(Op.SET),intern)
		}
		return o
	}
	set(tok:LexerLocation, name:string, value:number[]|boolean){
		const o = typeof value == 'boolean' ? [OpCode.o3(Op.PUSH_CONST,Type.BOOLEAN,~~value)] : value
		o.push(OpCode.o2(Op.SET),this.stringStorage.intern(name),OpCode.o2(Op.LINE,tok.first_line))
		return o
	}
	memberSet(tok:LexerLocation, object:number[], key:number[], value:number|boolean){
		const o = typeof value == 'boolean' ? [OpCode.o3(Op.PUSH_CONST,Type.BOOLEAN,~~value)] : value
		return Array.prototype.concat(o,object,key,[OpCode.o2(Op.SET_MEMBER),OpCode.o2(Op.LINE,tok.first_line)]) as number[]
	}
	function(tok:LexerLocation, name:string, body?:number[], args?:Argument[]){
		const o = this.createFunction(tok,name,Type.FUNCTION,body,args)
		o.push(
			OpCode.o3(Op.PUSH_VALUE,Type.FUNCTION),this.objects.length-1,
			OpCode.o2(Op.SET),this.stringStorage.intern('self.'+name)
		)
		return o
	}
	namespace(tok:LexerLocation, name:string, body?:number[]){
		const o = this.createFunction(tok,name,Type.NAMESPACE,body)
		const intern = this.stringStorage.intern('self.'+name)
		o.push(OpCode.o3(Op.PUSH_VALUE,Type.NAMESPACE),this.objects.length-1)
		if(body && body.length > 0){
			o.push(OpCode.o2(Op.DUP),OpCode.o2(Op.SET),intern)
			o.push(OpCode.o2(Op.CALL_UNSAFE,0),OpCode.o2(Op.DEALLOC,1))
		}else{
			o.push(OpCode.o2(Op.SET),intern)
		}
		return o
	}
	extern(tok:LexerLocation, name:string, target:string){
		const o = this.registerObject(tok,name,Type.EXTERN)
		this.objects[this.objects.length-1].address = this.stringStorage.intern(target)
		o.push(
			OpCode.o3(Op.PUSH_VALUE,Type.EXTERN),this.objects.length-1,
			OpCode.o2(Op.SET),this.stringStorage.intern('self.'+name)
		)
		return o
	}
	getCode(){
		return new Uint32Array(([] as number[]).concat(...this.code))
	}
	getObjects(){
		return this.objects
	}
	getStrings(){
		return this.stringStorage.getLut()
	}
	private registerObject(tok:LexerLocation, name:string, type:Type){
		if(name.indexOf('.')>=0)
			throw new CompilerError(tok,`'${name}' contains a '.' character and can not be used as ${OpCode.getTypeName(type)} name`)
		this.objects.push({
			name: this.stringStorage.intern(name),
			type: type
		})
		return [OpCode.o2(Op.OBJECT,this.objects.length-1)]
	}
	private functionHeader(tok:LexerLocation, args:Argument[], symbols:Map<number,number[]>){
		const head = [OpCode.o2(Op.FUNCTION,this.objects.length)]
		const mandatory = args.filter(a=>!a.optional).length
		const variadic = args.length > 0 ? !!args[args.length-1].variadic : undefined
		if(mandatory == args.length)
			head.push(OpCode.o2(Op.ASSERT_ARRITY_EQ,mandatory))
		else if(variadic)
			head.push(OpCode.o2(Op.SET_ARRITY_GE,args.length))
		else
			head.push(OpCode.o2(Op.SET_ARRITY_EQ,args.length))
		args.forEach((arg,i)=>{
			if(arg.name.indexOf('.')>=0)
				throw new CompilerError(tok,`'${arg.name}' can not be used as an argument name`)
			const intern = this.stringStorage.intern(arg.name)
			head.push(OpCode.o2(Op.LOCAL,-i),intern)
			if(symbols.has(intern))
				throw new CompilerError(tok,`argument '${arg.name}' redefined`)
			symbols.set(intern,[-i])
			if(arg.type){
				const type = OpCode.getTypeByName(arg.type)
				if(typeof type == "undefined")
					throw new CompilerError(tok,`undefined type '${arg.type}'`)
				head.push(OpCode.o3(arg.optional?Op.ASSERT_ARG_TYPE:Op.ASSERT_TYPE,type,-i))
			}
			if(arg.variadic)
				head.push(OpCode.o2(Op.PUSH_ARGUMENTS,args.length),OpCode.o2(Op.SET_LOCAL,-i))
		})
		return head
	}
	private createFunction(tok:LexerLocation, name:string, type:Type, body?:number[], args?:Argument[]){
		if(!body || body.length==0)
			return this.registerObject(tok,name,type)
		const symbols:Map<number,number[]> = new Map()
		const head = this.functionHeader(tok,args||[],symbols)
		const tail:number[] = []
		let localcnt = 0
		let maxcnt = 0
		let labelcnt = 0
		let labels:Map<number,number> = new Map()
		let locals:number[] = []
		const stack:any[] = []
		const lines:Map<number,number> = new Map()
		const opc = new OpCode()
		for(let i=0; i<body.length; i++){
			switch(opc.set(body[i]).op){
				case Op.BLKOPEN:
					stack.push(locals,labels)
					locals = []
					labels = new Map()
					break
				case Op.BLKCLOSE:
					for(const intern of locals){
						const tab = symbols.get(intern)
						if(typeof tab == 'undefined')
							throw new Error('scope error')
						tab.shift()
					}
					localcnt -= locals.length
					labels = stack.pop()
					locals = stack.pop()
					break
				case Op.LABEL:
				case Op.JMP_L:
				case Op.JE_L:
				case Op.JNE_L:{
					const lbl = opc.u24
					if(!labels.has(lbl))
						labels.set(lbl,labelcnt++)
					tail.push(OpCode.o2(opc.op,labels.get(lbl)))
					break
				}case Op.LOCAL:{
					const intern = body[++i]
					if(locals.indexOf(intern) >= 0)
						throw new Error(`local variable '${this.stringStorage.get(intern)}' redefined`)
					localcnt += 1
					locals.push(intern)
					const tab = symbols.get(intern)
					if(typeof tab == 'undefined')
						symbols.set(intern,[localcnt])
					else
						tab.unshift(localcnt)
					maxcnt = Math.max(localcnt,maxcnt)
					tail.push(OpCode.o2(Op.LOCAL,localcnt),intern)
					break
				}case Op.LINE:
					lines.set(opc.u24,tail.length)
					tail.push(opc.raw)
					break
				case Op.PUSH:
				case Op.SET:{
					const intern = body[++i]
					const tab = symbols.get(intern)
					if(tab && tab.length > 0)
						tail.push(OpCode.o2(opc.op==Op.PUSH ? Op.PUSH_LOCAL : Op.SET_LOCAL, tab[0]))
					else{
						const str = this.stringStorage.get(intern)
						const base = this.stringStorage.softIntern(str.split('.')[0])
						const local = typeof base != 'undefined' ? symbols.get(base) : undefined
						if(local && local.length > 0){
							tail.push(OpCode.o2(Op.PUSH_LOCAL,local[0]))
							tail.push(OpCode.o2(opc.op),this.stringStorage.intern(str.slice(str.indexOf('.'))))
						}else{
							tail.push(opc.raw,intern)
						}
					}
					break
				}case Op.OBJECT:
					this.objects[opc.u24].parent = this.objects.length
					break
				case Op.CONTINUE:
					throw new CompilerError(tok,"continue outside loop")
				case Op.BREAK:
					throw new CompilerError(tok,"break outside loop")
				default:
					tail.push(body[i])
					if(opc.isDWord())
						tail.push(body[++i])
			}
		}
		tail.push(OpCode.o3(Op.PUSH_CONST,Type.UNDEFINED,0),OpCode.o2(Op.RET))
		if(maxcnt > 0)
			head.push(OpCode.o2(Op.ALLOC,maxcnt))
		for(let i=0; i<tail.length; i++){
			opc.set(tail[i])
			if(opc.op == Op.LINE){
				if(lines.get(opc.s24) == i)
					head.push(tail[i])
			}else{
				head.push(tail[i])
				if(opc.isDWord())
					head.push(tail[++i])
			}
		}
		this.code.push(head)
		return this.registerObject(tok,name,type)
	}
}

export default Compiler
