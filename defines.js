/*jshint freeze:true, latedef:true, nocomma:false, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, esversion:6, loopfunc: true*/
"use strict";

const vm_constants = require('./vm_constants.js');

function createDefensiveObject(target){
	return new Proxy(target,{
		get: function(target, property){
			if(property in target)
				return target[property];
			throw new ReferenceError("Property \"" + property + "\" does not exist.");
		}
	});
}

var type_lut = Object.keys(vm_constants.type);
var op_lut = Object.keys(vm_constants.op);

module.exports = {
	opc16: (op,type,value) => (((op << 24) | (type << 16) | value) >>> 0),
	opc24: (op,value) => ((op << 24) | value) >>> 0,
	getOp: opc => (opc>>>24),
	getType: opc => ((opc>>>16)&0xFF), 
	getValue24: opc => (opc&0xFFFFFF),
	getValue24S: opc => (opc&0x800000?-((opc&0xFFFFFF)^0xFFFFFF)-1:opc&0xFFFFFF),
	getValue16: opc => (opc&0xFFFFF),
	getValue16S: opc => (opc&0x8000?-((opc&0xFFFF)^0xFFFF)-1:opc&0xFFFF),
	getTypeName: type => type_lut[type],
	getOpName: op => op_lut[op],
	isType: (child,parent) => (vm_constants.matrix[type_lut.length*child + parent]==1),
	op: vm_constants.op,
	type: vm_constants.type
};

module.exports.op = createDefensiveObject(module.exports.op);
module.exports.type = createDefensiveObject(module.exports.type);
