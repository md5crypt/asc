import {Compiler,CompilerError} from './Compiler'
import {OpCode,Op} from "./OpCode"

Compiler.registerExtension('istype',true,(tok,args,ss)=>{
	if(args.length != 2)
		throw new CompilerError(tok,`build-in function 'istype' called with ${args.length} argument(s)`)
	if(!Compiler.isString(args[1]))
		throw new CompilerError(tok,`secound argument of build-in function 'istype' has to be a constant string`)
	const typeName = ss.get(args[1][1])
	const type = OpCode.getTypeByName(typeName)
	if(!type)
		throw new CompilerError(tok,`unknown type name: '${typeName}'`)
	args[0].push(OpCode.o3(Op.ISTYPE,type))
	return args[0]
})

Compiler.registerExtension('_argc',true,(tok,args)=>{
	if(args.length != 0)
		throw new CompilerError(tok,`build-in function '_argc' called with ${args.length} argument(s)`)
	return [OpCode.o2(Op.PUSH_ARGUMENT_COUNT)]
})

Compiler.registerExtension('_argv',true,(tok,args)=>{
	if(args.length != 1)
		throw new CompilerError(tok,`build-in function '_argv' called with ${args.length} argument(s)`)
	args[0].push(OpCode.o2(Op.PUSH_ARGUMENT))
	return args[0]
})
