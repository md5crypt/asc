/*jshint freeze:true, latedef:true, nocomma:false, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, browser:true, esversion:6, loopfunc: true*/
"use strict";

var fs = require('fs');
var p = require("./parser.js");
var a = String(fs.readFileSync('test.as'));

const vm = require('./defines.js');

const OP_ONEARG = new Uint32Array(Object.keys(vm.op).length);
[
	vm.op.PUSH_LOCAL,
	vm.op.PUSH_MEMBER_CONST,
	vm.op.SET_MEMBER_CONST,
	vm.op.DEALLOC,
	vm.op.ALLOC,
	vm.op.SET_LOCAL,
	vm.op.JMP,
	vm.op.JE,
	vm.op.JNE,
	vm.op.CALL,
	vm.op.CALL_UNSAFE,
	vm.op.CALL_NATIVE,
	vm.op.CALL_EXTERNAL,
	vm.op.DISPATCH,
	vm.op.ASSERT_ARRITY_EQ,
	vm.op.ASSERT_ARRITY_GE,
	vm.op.LINE,
	vm.op.JMP_L,
	vm.op.JE_L,
	vm.op.JNE_L,
	vm.op.LABEL,
	vm.op.FUNCTION
].forEach(x=>OP_ONEARG[x] = 1);

p.parse(a);
console.log(p.parser.strings);

var strings = Array.from(p.parser.strings.keys());
var code = p.parser.code;
for(var i=0; i<code.length; i++){
	var opc = code[i];
	if(OP_ONEARG[vm.getOp(opc)]){
		console.log(`${vm.getOpName(vm.getOp(opc))} ${vm.getValue24S(opc)}`);
		continue;
	}
	switch(vm.getOp(opc)){
		case vm.op.PUSH:
		case vm.op.SET:
			console.log(`${vm.getOpName(vm.getOp(opc))} ${strings[vm.getValue24(opc)]}`);
			break;
		case vm.op.PUSH_VALUE:
			console.log(`push ${code[++i]}::${vm.getTypeName(vm.getType(opc))}`);
			break;
		case vm.op.PUSH_CONST:
			console.log(`push ${vm.getValue16(opc)}::${vm.getTypeName(vm.getType(opc))}`);
			break;
		case vm.op.LOCAL:
			console.log(`local ${strings[code[++i]]} ${vm.getValue24S(opc)}`);
			break;
		case vm.op.CHKTYPE:
			console.log(`chktype ${vm.getTypeName(vm.getType(opc))}`);
			break;
		case vm.op.ASSERT_TYPE:
			console.log(`assert_type ${vm.getValue16S(opc)}, ${vm.getTypeName(vm.getType(opc))}`);
			break;
		default:
			console.log(vm.getOpName(vm.getOp(opc)));
	}
}
