import {OpCode,Op,Type} from './OpCode'
import StringStorage from './StringStorage'

const operatorMap = new Map(Object.entries({
	'|':Op.BOR,'^':Op.BXOR,'&':Op.BAND,'==':Op.EQ,'===':Op.EQEQ,'!=':Op.NEQ,'!==':Op.NEQNEQ,
	'<':Op.LT,'<=':Op.LE,'>':Op.GT,'>=':Op.GE,'>>':Op.SHR,'>>>':Op.LSR,'<<':Op.SHL,'+':Op.ADD,
	'-':Op.SUB,'*':Op.MUL,'/':Op.DIV,'%':Op.MOD,'!':Op.NOT,'~':Op.BNOT,'~~':Op.NEG
}))

const logicalOperators = new Set(['||','&&','==','===','!=','!==','<','<=','>','>=','!'])
const integerOperators = new Set(['|','^','&','<<','>>','>>>','%','!','~'])
const allowedEvents = new Set(['use', 'enter', 'exit', 'combine'])
const namespaceTypes = new Map([
	['namespace', Type.NAMESPACE],
	['location', Type.LOCATION],
	['object', Type.OBJECT],
	['item', Type.ITEM],
	['character', Type.CHARACTER],
	['dialog', Type.DIALOG]
])

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
		const ln = tok.first_line
		if(isNaN(ln)){
			super(msg)
			this.hash = {'loc':tok}
		}else{
			super(`(line ${ln}) ${msg}`)
			this.hash = {'line':ln-1,'loc':tok}
		}
	}
}

export interface ObjectMetadata{
	name: number
	type: Type
	parent?: number
	address?: number
}

interface Argument{
	name?: string
	type?: string
	optional?: boolean
	variadic?: boolean
}

type CompilerExtension = (tok:LexerLocation,args:number[][],stringStorage:StringStorage)=>number[]

function operatorEval(op:string, l:number, r:number){
	switch(op){
		case '|': return l | r
		case '||': return l || r
		case '^': return l ^ r
		case '&': return l & r
		case '&&': return l && r
		case '==': return (l == r)?1:0
		case '===': return (l === r)?1:0
		case '!=': return (l != r)?1:0
		case '!==': return (l !== r)?1:0
		case '<': return (l < r)?1:0
		case '<=': return (l <= r)?1:0
		case '>': return (l > r)?1:0
		case '>=': return (l >= r)?1:0
		case '<<': return l << r
		case '>>': return l >> r
		case '>>>': return l >>> r
		case '+': return l + r
		case '-': return l - r
		case '*': return l * r
		case '/': return l / r
		case '%': return l % r
		case '!': return (!l)?1:0
		case '~': return ~l
		case '~~': return -l
		default: throw new Error('invalid operator')
	}
}

function readFloat(value:number){
	const view = new DataView(new ArrayBuffer(4))
	view.setUint32(0,value,true)
	return view.getFloat32(0,true)
}

export class Compiler{
	private static extensions:Map<string,CompilerExtension>[] = [new Map(),new Map()]
	private objects: ObjectMetadata[] = []
	private code: number[][] = []
	private stringStorage = new StringStorage()
	private labels = 0
	static registerExtension(name:string,expression:boolean,ext:CompilerExtension){
		Compiler.extensions[~~expression].set(name,ext)
	}
	static isString(expr:number[]){
		const opc = new OpCode(expr[0])
		return expr.length <= 2 && opc.op == Op.PUSH_VALUE && opc.type == Type.STRING
	}
	static isNumeric(expr:number[]){
		const opc = new OpCode(expr[0])
		return expr.length <= 2 && opc.op == Op.PUSH_VALUE && (opc.type == Type.BOOLEAN || opc.type == Type.FLOAT || opc.type == Type.INTEGER)
	}
	static isInteger(expr:number[]){
		const opc = new OpCode(expr[0])
		return expr.length <= 2 && opc.op == Op.PUSH_VALUE && opc.type == Type.INTEGER
	}
	static isVarible(expr:number[]){
		const opc = new OpCode(expr[0])
		return (expr.length <= 3 && opc.op == Op.PUSH)
	}
	static isConstant(expr:number[]){
		const opc = new OpCode(expr[0])
		return expr.length <= 2 && opc.op == Op.PUSH_VALUE
	}
	static isValue(expr:number[]){
		const opc = new OpCode(expr[0])
		return (expr.length <= 3 && opc.op == Op.PUSH) || (expr.length <= 2 && opc.op == Op.PUSH_VALUE)
	}
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
			return [OpCode.o3(Op.PUSH_VALUE,Type.BOOLEAN),0]
		if(str == 'true')
			return [OpCode.o3(Op.PUSH_VALUE,Type.BOOLEAN),1]
		return [OpCode.o3(Op.PUSH_VALUE,Type.UNDEFINED),0]
	}
	integer(tok:LexerLocation, str:string|number){
		const n = typeof str == 'number'?str:parseFloat(str)
		if(isNaN(n) || n == Infinity || n == -Infinity)
			throw new CompilerError(tok,`'${str}' equlas to ${n}`)
		if(n > 0x7FFFFFFF || n < -2147483648)
			throw new CompilerError(tok,`'${str}' overflows uint32_t`)
		return [OpCode.o3(Op.PUSH_VALUE,Type.INTEGER),n]
	}
	float(str:string|number){
		const n = typeof str == 'number'?str:parseFloat(str)
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
		return [
			...([] as number[]).concat(...args.reverse()),
			OpCode.o2(Op.PUSH),this.stringStorage.intern('root.stdlib.array.static'),
			OpCode.o2(Op.CALL,args.length),
			OpCode.o2(Op.LINE,tok.first_line)
		]
	}
	varname(tok:LexerLocation, str:string){
		return [
			OpCode.o2(Op.PUSH),
			this.stringStorage.intern(str[0]=='.'?'root'+str:str),
			OpCode.o2(Op.LINE,tok.first_line)
		]
	}
	string(str:string){
		return [
			OpCode.o3(Op.PUSH_VALUE,Type.STRING),
			this.stringStorage.intern(str)
		]
	}
	object(id:number){
		return [OpCode.o2(Op.OBJECT,id)]
	}
	whileBlock(tok:LexerLocation, expression:number[], body:number[], iterator?:number[]){
		const lblHeader = this.labels++
		const lblFooter = this.labels++
		const lblPreFooter = iterator?this.labels++:0
		expression.unshift(OpCode.o2(Op.LABEL,lblHeader))
		expression.push(OpCode.o2(Op.JNE_L,lblFooter), OpCode.o2(Op.LINE,tok.first_line))
		const opc = new OpCode()
		for(let i=0; i<body.length; i++){
			switch(opc.set(body[i]).op){
				case Op.BREAK:
					expression.push(OpCode.o2(Op.JMP_L,lblFooter))
					break
				case Op.CONTINUE:
					expression.push(OpCode.o2(Op.JMP_L,iterator?lblPreFooter:lblHeader))
					break
				default:
					expression.push(body[i])
					if(opc.isDWord())
						expression.push(body[++i])
				}
		}
		if(iterator)
			expression.push(OpCode.o2(Op.LABEL,lblPreFooter),...iterator)
		expression.push(OpCode.o2(Op.JMP_L,lblHeader),OpCode.o2(Op.LABEL,lblFooter))
		return expression
	}
	forBlock(tok:LexerLocation, body:number[], local:string, array:number[]){
		let arrayExpression = array
		const output:number[] = []
		if(!Compiler.isValue(array)){
			arrayExpression = this.varname(tok,'$forarray')
			output.push(...this.local(tok,'$forarray',array))
		}
		body.unshift(...this.local(tok,local,this.index(tok,arrayExpression.slice(0),this.varname(tok,'$forindex'))))
		return this.wrapBlock(output.concat(
			this.local(tok,'$forindex',this.integer(tok,'0')),
			this.local(tok,'$forto',this.callExpression(tok,'root.stdlib.length',[arrayExpression])),
			this.whileBlock(
				tok,
				this.expression(tok,'<',this.varname(tok,'$forindex'),this.varname(tok,'$forto')),
				body,
				this.set(tok,'$forindex',this.expression(tok,'+',this.varname(tok,'$forindex'),this.integer(tok,'1')))
			)
		))
	}
	forBlockNumeric(tok:LexerLocation, body:number[], local:string, from:number[], to:number[], step?:number[]){
		let toExpression = to
		let stepExpression = step || this.integer(tok,'1')
		const output:number[] = []
		if(!Compiler.isValue(to)){
			toExpression = this.varname(tok,'$forto')
			output.push(...this.local(tok,'$forto',to))
		}
		if(step && !Compiler.isValue(step)){
			stepExpression = this.varname(tok,'$forstep')
			output.push(...this.local(tok,'$forstep',step))
		}
		return this.wrapBlock(output.concat(
			this.local(tok,local,from),
			this.whileBlock(
				tok,
				this.expression(tok,'<',this.varname(tok,local),toExpression),
				body,
				this.set(tok,local,this.expression(tok,'+',this.varname(tok,local),stepExpression))
			)
		))
	}
	ifBlock(tok:LexerLocation, expression:number[], iftrue:number[], iffalse?:number[]){
		if(iffalse){
			const lblElse = this.labels++
			const lblFooter = this.labels++
			expression.push(OpCode.o2(Op.JNE_L,lblElse),OpCode.o2(Op.LINE,tok.first_line))
			expression.push(...iftrue)
			expression.push(OpCode.o2(Op.JMP_L,lblFooter),OpCode.o2(Op.LABEL,lblElse))
			expression.push(...iffalse)
			expression.push(OpCode.o2(Op.LABEL,lblFooter))
		}else{
			const lblFooter = this.labels++
			expression.push(OpCode.o2(Op.JNE_L,lblFooter),OpCode.o2(Op.LINE,tok.first_line))
			expression.push(...iftrue)
			expression.push(OpCode.o2(Op.LABEL,lblFooter))
		}
		return expression
	}
	eval(tok:LexerLocation, op:string, left:number[], right?:number[]){
		const opc = new OpCode()
		const ltype = opc.set(left[0]).type
		const rtype = right?opc.set(right[0]).type:Type.INVALID
		let lvalue = left[1]
		let rvalue = right?right[1]:0
		if(logicalOperators.has(op)){
			const nullstring = this.stringStorage.softIntern('')
			lvalue = (ltype == Type.STRING) && (lvalue == nullstring) ? 0 : lvalue
			rvalue = (rtype == Type.STRING) && (rvalue == nullstring) ? 0 : rvalue
			return this.atom(operatorEval(op,lvalue,rvalue)?"true":"false")
		}else if(integerOperators.has(op)){
			if(ltype == Type.INTEGER && (!right || rtype == Type.INTEGER))
				return this.integer(tok,operatorEval(op,lvalue,rvalue))
		}else if(op == '+' && ltype == Type.STRING && rtype == Type.STRING){
			return this.string(this.stringStorage.get(lvalue)+this.stringStorage.get(rvalue))
		}else if(
			(ltype == Type.INTEGER || ltype == Type.FLOAT) &&
			(!right || (rtype == Type.INTEGER || rtype == Type.FLOAT))
		){
			if(ltype == Type.INTEGER && (!right || rtype == Type.INTEGER))
				return this.integer(tok,operatorEval(op,lvalue,rvalue))
			if(ltype == Type.FLOAT)
				lvalue = readFloat(lvalue)
			if(rtype == Type.FLOAT)
				rvalue = readFloat(rvalue)
			if(integerOperators.has(op)) {
				return this.integer(tok,~~operatorEval(op,lvalue,rvalue))
			}
			return this.float(operatorEval(op,lvalue,rvalue))
		}
		throw new CompilerError(tok,`can not apply operator '${op}' on type '${OpCode.getTypeName(ltype)}'`+
			(right?` and '${OpCode.getTypeName(rtype)}'`:''))
	}
	expression(tok:LexerLocation, op:string, left?:number[], right?:number[]){
		if(left && right && Compiler.isConstant(left) && Compiler.isConstant(right)){
			return this.eval(tok,op,left,right)
		}else if(left && !right && Compiler.isConstant(left)){
			return this.eval(tok,op,left)
		}else if(!left && right && Compiler.isConstant(right)){
			return this.eval(tok,op,right)
		}
		if(op == '&&' || op == '||'){
			if(!left || !right)
				throw new CompilerError(tok,`invalid short-circut expression`)
			//short-circut implementation
			const lbl = this.labels++
			left.push(OpCode.o2(Op.DUP,1))
			if(op == '||')
				left.push(OpCode.o2(Op.JE_L,lbl))
			else
				left.push(OpCode.o2(Op.JNE_L,lbl))
			left.push(OpCode.o2(Op.DEALLOC,1))
			left.push(...right)
			left.push(OpCode.o2(Op.LABEL,lbl),OpCode.o2(Op.LINE,tok.first_line))
			return left
		}
		const o:number[] = []
		if(left)
			o.push(...left)
		if(right)
			o.push(...right)
		const operator = operatorMap.get(op)
		if(!operator)
			throw new CompilerError(tok,`invalid operator '${operator}'`)
		o.push(OpCode.o2(operator,OpCode.o2(Op.LINE,tok.first_line)))
		return o
	}
	callExpression(tok:LexerLocation, func:number[]|string, args: number[][]){
		const funcExpr = typeof func == 'string'?this.varname(tok,func):func
		if(Compiler.isVarible(funcExpr)){
			const name = this.stringStorage.get(funcExpr[1])
			const ext = Compiler.extensions[1].get(name)
			if(ext)
				return ext(tok,args,this.stringStorage)
		}
		return ([] as number[]).concat(...args.reverse(),funcExpr,OpCode.o2(Op.CALL,args.length),OpCode.o2(Op.LINE,tok.first_line))
	}
	stringExpression(tok:LexerLocation, args: number[][]){
		if(args.length == 1 && Compiler.isString(args[0]))
			return args[0]
		return this.callExpression(tok,'root.stdlib.string.concat',args)
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
		if(typeof name === 'string'){
			const ext = Compiler.extensions[0].get(name)
			if(ext)
				return ext(tok,args,this.stringStorage)
		}
		const o = ([] as number[]).concat(...args.reverse())
		if(typeof name === 'object'){
			o.push(...name)
		}else{
			o.push(OpCode.o2(Op.PUSH),this.stringStorage.intern(name))
		}
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
	set(tok:LexerLocation, name:string, value:number[]){
		value.push(OpCode.o2(Op.SET),this.stringStorage.intern(name),OpCode.o2(Op.LINE,tok.first_line))
		return value
	}
	setBlock(tok:LexerLocation,varname:string,pairs:{key:string,value:number[],tok:LexerLocation}[]){
		const out = this.local(tok,'$setself',this.varname(tok,varname))
		for(const pair of pairs){
			pair.value.push(...this.varname(pair.tok,'$setself'))
			out.push(...this.set(pair.tok,'.'+pair.key,pair.value))
		}
		return this.wrapBlock(out)
	}
	setPair(tok:LexerLocation,varname:string,expression:number[]){
		if(varname[0]=='.')
			throw new CompilerError(tok,`member can not start with a dot ('${varname}')`)
		expression.push(OpCode.o2(Op.SET),this.stringStorage.intern('.'+varname))
		return expression
	}
	import(tok:LexerLocation, what:string|string[], from:string){
		if(typeof what == 'string')
			return this.object(this.registerObject(tok,what,Type.IMPORT))
		return what.map(x=>OpCode.o2(Op.OBJECT,this.registerObject(tok,from+'.'+x,Type.IMPORT)))
	}
	memberSet(tok:LexerLocation, object:number[], key:number[], value:number|boolean){
		const o = typeof value == 'boolean' ? [OpCode.o3(Op.PUSH_CONST,Type.BOOLEAN,~~value)] : value
		return Array.prototype.concat(o,object,key,[OpCode.o2(Op.SET_MEMBER),OpCode.o2(Op.LINE,tok.first_line)]) as number[]
	}
	functionGeneral(tok:LexerLocation, name:string, type: Type, body:number[], args?:Argument[], modifiers?:string[]){
		const id = this.registerObject(tok,name,type)
		if(!body || !this.createFunction(tok,id,body,args))
			this.objects[id].type = Type.STUB
		const out = this.object(id)
		if (modifiers && modifiers.length > 0)
			out.push(...this.applyModifiers(tok, modifiers, id, type))
		return out
	}
	functionEvent(tok:LexerLocation, name:string, body:number[], modifiers?:string[]){
		if (!allowedEvents.has(name))
			throw new CompilerError(tok,`'${name}' is an invalid event name`)
		return this.functionGeneral(
			tok,
			'__on_' + name,
			Type.EVENT,
			body,
			(name == 'combine') ? [{name:'target', type:'namespace'}] : undefined,
			modifiers
		)
	}
	functionOption(tok:LexerLocation, name:string, text:number[] | null, body:number[], modifiers?:string[]){
		const out = this.functionGeneral(tok, name, Type.OPTION, body, undefined, modifiers)
		if (text) {
			out.push(...this.set(tok, name + '.name', text))
		}
		out.push(...this.call(tok, 'root.stdlib.array.push', [
			this.varname(tok, 'self.options'),
			this.varname(tok, name)
		]))
		return out
	}
	functionOptionAnonymous(tok:LexerLocation, text:number[] | null, body:number[], modifiers?:string[]){
		const id = this.registerObject(tok, '__anonymous', Type.OPTION)
		this.createFunction(tok, id, body, [])
		const out = this.object(id)
		if (text) {
			out.push(
				...text,
				OpCode.o3(Op.PUSH_VALUE, Type.FUNCTION),
				id,
				OpCode.o3(Op.PUSH_VALUE, Type.STRING),
				this.stringStorage.intern('name'),
				OpCode.o2(Op.SET_MEMBER_UNSAFE)
			)
		}
		if (modifiers && modifiers.length > 0) {
			out.push(...this.applyModifiers(tok, modifiers, id, Type.OPTION))
		}
		out.push(...this.call(tok, 'root.stdlib.array.push', [
			this.varname(tok, 'self.options'),
			[OpCode.o3(Op.PUSH_VALUE, Type.OPTION), id]
		]))
		return out
	}
	function(tok:LexerLocation, name:string, body:number[], args?:Argument[], modifiers?:string[]){
		return this.functionGeneral(tok, name, Type.FUNCTION, body, args, modifiers)
	}
	namespace(tok:LexerLocation, name:string, typeName: string, optBody?:number[], modifiers?:string[], text?:number[]){
		const type = namespaceTypes.get(typeName)
		if (type === undefined) {
			throw new Error(`invalid type name: ${typeName}`)
		}
		const id = this.registerObject(tok, name, type)
		const out = this.object(id)
		if (modifiers && modifiers.length > 0) {
			out.push(...this.applyModifiers(tok, modifiers, id, type))
		}
		const body = optBody || []
		if (text) {
			body.push(...this.set(tok, 'self.name', text))
		}
		if (typeName == 'dialog') {
			body.unshift(...this.set(tok, 'self.options', this.callExpression(tok, 'root.stdlib.array.static', [])))
		}
		if(body && body.length && this.createFunction(tok, id, body)) {
			out.push(
				OpCode.o3(Op.PUSH_VALUE, Type.FUNCTION),
				id,
				OpCode.o2(Op.CALL, 0),
				OpCode.o2(Op.LINE, tok.first_line)
			)
		}
		return out
	}
	scope(tok:LexerLocation, name:string, body?:number[]){
		if(body){
			this.objects.push({name:this.stringStorage.intern(name),type:Type.SCOPESTUB})
			const id = this.objects.length-1
			if(this.createFunction(tok,id,body)){
				this.objects[id].type = Type.SCOPE
				return [OpCode.o3(Op.PUSH_VALUE,Type.FUNCTION),id,OpCode.o2(Op.CALL,0),OpCode.o2(Op.LINE,tok.first_line)]
			}
		}
		return []
	}
	extern(tok:LexerLocation, name:string, target:string){
		const id = this.registerObject(tok,name,Type.EXTERN)
		this.objects[id].address = this.stringStorage.intern(target)
		return this.object(id)
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
	private applyModifiers(tok:LexerLocation, modifiers: string[], id: number, type:Type){
		const out:number[] = [OpCode.o3(Op.PUSH_VALUE,type), id]
		if (modifiers.length > 1) {
			out.push(OpCode.o2(Op.DUP,modifiers.length-1))
		}
		for (const f of modifiers) {
			const path = f.split('.')
			path[path.length-1] = '__mod_'+path[path.length-1]
			out.push(
				...this.varname(tok,path.join('.')),
				OpCode.o2(Op.CALL,1),
				OpCode.o2(Op.LINE,tok.first_line)
			)
		}
		out.push(OpCode.o2(Op.DEALLOC,modifiers.length))
		return out
	}
	private registerObject(tok:LexerLocation, name:string, type:Type){
		if(type != Type.IMPORT && name.indexOf('.')>=0)
			throw new CompilerError(tok,`'${name}' contains a '.' character and can not be used as ${OpCode.getTypeName(type)} name`)
		this.objects.push({
			name: this.stringStorage.intern(name),
			type
		})
		return this.objects.length-1
	}
	private functionHeader(tok:LexerLocation, id:number, args:Argument[], symbols:Map<number,number[]>){
		const head = [OpCode.o2(Op.FUNCTION,id)]
		const mandatory = args.filter(a=>!a.optional).length
		const variadic = args.length > 0 ? !!args[args.length-1].variadic : undefined
		if(variadic){
			head.push(OpCode.o2(Op.ASSERT_ARITY_GE,args.length-1))
		}else if(mandatory == args.length){
			head.push(OpCode.o2(Op.ASSERT_ARITY_EQ,mandatory))
		} else {
			if (mandatory > 0)
				head.push(OpCode.o2(Op.ASSERT_ARITY_GE,mandatory))
			head.push(OpCode.o2(Op.SET_ARITY,args.length))
		}
		args.forEach((arg,i)=>{
			if(arg.variadic || !arg.name)
				return
			if(arg.name.indexOf('.')>=0)
				throw new CompilerError(tok,`'${arg.name}' can not be used as an argument name`)
			const intern = this.stringStorage.intern(arg.name)
			head.push(OpCode.o2(Op.LOCAL,-i-1),intern)
			if(symbols.has(intern))
				throw new CompilerError(tok,`argument '${arg.name}' redefined`)
			symbols.set(intern,[-i-1])
			if(arg.type && arg.type != 'any'){
				const type = OpCode.getTypeByName(arg.type.toLowerCase())
				if(typeof type == "undefined")
					throw new CompilerError(tok,`undefined type '${arg.type.toLowerCase()}'`)
				head.push(OpCode.o3(arg.optional?Op.ASSERT_TYPE_SOFT:Op.ASSERT_TYPE,type,-i-1))
			}
		})
		head.push(OpCode.o2(Op.LINE,tok.first_line))
		return head
	}
	private createFunction(tok:LexerLocation, id:number, body:number[], args?:Argument[]){
		const symbols:Map<number,number[]> = new Map()
		const head = this.functionHeader(tok,id,args||[],symbols)
		const tail:number[] = []
		let localcnt = 0
		let maxcnt = 0
		let locals:number[] = []
		const stack:number[][] = []
		const lines:Map<number,number> = new Map()
		const opc = new OpCode()
		if (args && args.length && args[args.length-1].variadic && args[args.length-1].name) {
			const name = args[args.length-1].name!
			const intern = this.stringStorage.intern(name)
			localcnt = 1
			maxcnt = 1
			locals.push(intern)
			symbols.set(intern,[2])
			tail.push(OpCode.o2(Op.LOCAL,2),intern)
			tail.push(OpCode.o2(Op.PUSH_ARGUMENT_ARRAY,args.length-1),OpCode.o2(Op.SET_LOCAL,2))
		}
		for(let i=0; i<body.length; i++){
			switch(opc.set(body[i]).op){
				case Op.BLKOPEN:
					stack.push(locals)
					locals = []
					break
				case Op.BLKCLOSE:
					for(const intern of locals){
						const tab = symbols.get(intern)
						if(typeof tab == 'undefined')
							throw new Error('scope error')
						tab.shift()
					}
					localcnt -= locals.length
					locals = stack.pop() as number[]
					break
				case Op.LOCAL:{
					const intern = body[++i]
					if(locals.indexOf(intern) >= 0)
						throw new Error(`local variable '${this.stringStorage.get(intern)}' redefined`)
					localcnt += 1
					locals.push(intern)
					const tab = symbols.get(intern)
					if(typeof tab == 'undefined')
						symbols.set(intern,[localcnt+1])
					else
						tab.unshift(localcnt+1)
					maxcnt = Math.max(localcnt,maxcnt)
					tail.push(OpCode.o2(Op.LOCAL,localcnt+1),intern)
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
					this.objects[opc.u24].parent = id
					//tail.push(body[i])
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
		if(tail.length == 0)
			return false
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
		return true
	}
}

export default Compiler
