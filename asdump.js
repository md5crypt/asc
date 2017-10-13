/*jshint freeze:true, latedef:true, nocomma:false, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, browser:true, esversion:6, loopfunc: true*/
"use strict";

var fs = require('fs');
const vm = require('./defines.js');

function readObjects(index,data){
	for(var i=0; i<data.length; i+=4){
		index.push({
			type: data[i],
			name: data[i+1],
			parent: data[i+2],
			address: data[i+3]
		});
	}
}

function readStrings(index,data){
	if(data.length == 0)
		return;
	var chars = new Uint16Array(data.buffer,data.byteOffset);
	var p = 0;
	while(p < data.length){
		var s = data[p++]/2;
		index.push(String.fromCharCode.apply(null,chars.subarray(p*2,p*2+s)));
		p += (s+(s&1))/2;
	}
}

function objectPath(objects,o){
	var path = [];
	while(o != 0xFFFFFFFF){
		path.push(objects[objects[o].name]);
		o = objects[o].parent;
	}
	return path.reverse().join('.');
}

function valueToString(objects,v,t){
	if(t == vm.type.STRING)
		return `'${objects[v]}'::string`;
	if(t == vm.type.INTEGER)
		return `${v}::integer`;
	if(t == vm.type.FLOAT){
		var buffer = new ArrayBuffer(4);
		var intview = new Int32Array(buffer);
		var floatview = new Float32Array(buffer);
		intview[0] = v;
		return `${floatview[0]}::float`;
	}
	if(t == vm.type.BOOLEAN){
		return `${!!v}::boolean`;
	}
	if(vm.isType(t,vm.type.OBJECT))
		return `${objectPath(objects,v)}::${vm.getTypeName(t)}`;
	return `::${vm.getTypeName(t)}`;
}

function buildLabelIndex(code){
	var labels = [];
	for(var i=0; i<code.length; i++){
		var opc = code[i];
		switch(vm.getOp(opc)){
			case vm.op.PUSH_VALUE:
				i+=1;
				break;
			case vm.op.JMP:
			case vm.op.JE:
			case vm.op.JNE:
				labels.push(i+vm.getValue24S(opc));
				break;
		}
	}
	return labels.sort();
}

var buf = fs.readFileSync('./__output/image.bin');
var bin = new Uint32Array(buf.buffer,buf.byteOffset,buf.byteLength/4);
if(bin[0] != 0xB5006BB1)
	throw new Error("magic word incorrect");
var code = bin.subarray(4,4+bin[1]/4);
var objects = [];
readObjects(objects,bin.subarray(4+bin[1]/4,4+(bin[1]+bin[2])/4));
var functions = objects.map((o,i)=>[o.address,i]).filter(o=>o[0]!=0xFFFFFFFF).sort((a,b)=>a[0]-b[0]);
readStrings(objects,bin.subarray(4+(bin[1]+bin[2])/4));
var labels = buildLabelIndex(code);
var labelMap = new Map();
labels.forEach((l,i)=>labelMap.set(l,i));
for(var i=0; i<code.length; i++){
	var offset = i.toString(16).toUpperCase().padStart(8,'0');
	if(functions.length && i >= functions[0][0]){
		console.log(`\n${objectPath(objects,functions[0][1])}`);
		functions.shift();
	}
	if(labels.length && i >= labels[0]){
		console.log(`lbl_${labelMap.get(i)}`);
		labels.shift();
	}
	var opc = code[i];
	switch(vm.getOp(opc)){
		case vm.op.PUSH_LOCAL:
		case vm.op.DEALLOC:
		case vm.op.ALLOC:
		case vm.op.SET_LOCAL:
		case vm.op.CALL:
		case vm.op.CALL_UNSAFE:
		case vm.op.CALL_NATIVE:
		case vm.op.CALL_EXTERNAL:
		case vm.op.DISPATCH:
		case vm.op.ASSERT_ARRITY_EQ:
		case vm.op.ASSERT_ARRITY_GE:
			console.log(`${offset}: ${vm.getOpName(vm.getOp(opc))} ${vm.getValue24S(opc)}`);
			break;
		case vm.op.PUSH_VALUE:
			console.log(`${offset}: push_value ${valueToString(objects,code[++i],vm.getType(opc))}`);
			break;
		case vm.op.PUSH_CONST:
			console.log(`${offset}: push_const ${valueToString(objects,vm.getValue16(opc),vm.getType(opc))}`);
			break;	
		case vm.op.PUSH_MEMBER_CONST:
		case vm.op.SET_MEMBER_CONST:
			console.log(`${offset}: ${vm.getOpName(vm.getOp(opc))} '${objects[vm.getValue24(opc)]}'`);
			break;
		case vm.op.CHKTYPE:
			console.log(`${offset}: chk_type ${vm.getTypeName(vm.getType(opc))}`);
			break;
		case vm.op.ASSERT_TYPE:
			console.log(`${offset}: assert_type ${vm.getValue16S(opc)}, ${vm.getTypeName(vm.getType(opc))}`);
			break;
		case vm.op.JMP:
		case vm.op.JE:
		case vm.op.JNE:
			console.log(`${offset}: ${vm.getOpName(vm.getOp(opc))} ${vm.getValue24S(opc)} (lbl_${labelMap.get(i+vm.getValue24(opc))})`);
			break;
		default:
			console.log(`${offset}: ${vm.getOpName(vm.getOp(opc))}`);
	}
}
