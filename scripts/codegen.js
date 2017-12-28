/*jshint freeze:true, latedef:true, nocomma:false, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, esversion:6, loopfunc: true*/
"use strict";

const fs = require('fs');
const types = require('../vm_type.json');
const op = require('../vm_op.json');

op.push(
	"line","local","jmp_l","je_l","jne_l",
	"label","push","set","function","object",
	"continue","break","blkopen","blkclose"
);

types.push(['import','object'],['stub','function'])

const map = {};
for(var i=0; i<types.length; i++)
	map[types[i][0]] = i;

const n = types.length;
const matrix = new Uint8Array(n*n);

for(let k=0; k<n; k++){ //haha, I'm lazy
	for(let i=0; i<n; i++){
		matrix[i+i*n] = 1;
		if(!types[i][1])
			continue;
		const b = map[types[i][1]];
		for(var j=0; j<n; j++)
			matrix[j+i*n] = matrix[j+b*n];
		matrix[i+i*n] = 1;
	}
}
console.log("codegen.js: creating vmConstants.ts");
fs.writeFileSync('src/vmConstants.ts',`export const enum Type {\n\t${types.map(a=>a[0].toUpperCase()).join(',\n\t')}\n}
export const enum Op {\n\t${op.map(a=>a.toUpperCase()).join(',\n\t')}\n}
export const typeLut = ["${types.map(a=>a[0]).join('","')}"]
export const opLut = ["${op.join('","')}"]
export const typeMatrix = [${Array.from(matrix).join(',')}]\n`);
