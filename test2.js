/*jshint freeze:true, latedef:true, nocomma:false, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, browser:true, esversion:6, loopfunc: true*/
"use strict";

var fs = require('fs');
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
].forEach(x=>OP_ONEARG[x] = 1);

var buf = fs.readFileSync('output.bin');
var code = new Uint32Array(buf.buffer,buf.byteOffset,buf.byteLength/4);
for(var i=0; i<code.length; i++){
	var opc = code[i];
	if(OP_ONEARG[vm.getOp(opc)]){
		console.log(`${vm.getOpName(vm.getOp(opc))} ${vm.getValue24S(opc)}`);
		continue;
	}
	switch(vm.getOp(opc)){
		case vm.op.PUSH_VALUE:
			console.log(`push_value ${code[++i]}::${vm.getTypeName(vm.getType(opc))}`);
			break;
		case vm.op.PUSH_CONST:
			console.log(`push_const ${vm.getValue16S(opc)}::${vm.getTypeName(vm.getType(opc))}`);
			break;
		case vm.op.CHKTYPE:
			console.log(`chk_type ${vm.getTypeName(vm.getType(opc))}`);
			break;
		case vm.op.ASSERT_TYPE:
			console.log(`assert_type ${vm.getValue16S(opc)}, ${vm.getTypeName(vm.getType(opc))}`);
			break;
		default:
			console.log(vm.getOpName(vm.getOp(opc)));
	}
}
