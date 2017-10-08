/*jshint freeze:true, latedef:true, nocomma:false, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, esversion:6, loopfunc: true*/
"use strict";

const fs = require('fs');
const types = require('./vm_type.json');
const op = require('./vm_op.json');


op.push(
	"line","local","jmp_l","je_l","jne_l",
	"label","push","set","function","object",
	"continue","break","blkopen","blkclose"
);

var map = {};
for(var i=0; i<types.length; i++)
	map[types[i][0]] = i;

var n = types.length;
var matrix = new Uint8Array(n*n);

for(var k=0; k<n; k++){ //haha, I'm lazy
	for(var i=0; i<n; i++){
		matrix[i+i*n] = 1;
		if(!types[i][1])
			continue;
		var b = map[types[i][1]];
		for(var j=0; j<n; j++)
			matrix[j+i*n] = matrix[j+b*n];
		matrix[i+i*n] = 1;
	}
}
console.log("codegen.js: creating vm_constants.js");
fs.writeFileSync('vm_constants.js','module.exports = '+JSON.stringify({
	type: types.reduce((a,b,i)=>(a[b[0].toUpperCase()]=i,a),{}),
	op: op.reduce((a,b,i)=>(a[b.toUpperCase()]=i,a),{}),
	matrix: Array.from(matrix)
})+';');