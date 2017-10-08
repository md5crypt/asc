/*jshint freeze:true, latedef:true, nocomma:true, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, esversion:6, loopfunc:true*/
"use strict";

const program = require('commander');
const glob = require('glob');
const fs = require('fs-extra');

const vm = require('./defines.js');

program
  .version('0.2.0')
  .description('adventurescript linker')
  .usage('[options]')
  .option('-d, --directory [directory]', 'set the root directory', '.')
  .parse(process.argv);

var cwd = program.directory;
console.log("--- [adventurescript linker v"+program.version()+"] ---");
if(!fs.existsSync(cwd)){
	console.error("\nError: the specifed directory does no exist");
	return 1;
}
console.log(`using directory ${require('path').resolve(cwd)}`);
cwd = cwd.replace(/\\/g,'/').replace(/[\/]+$/,'');

//-----------------------------------------------------------------------------------------
//-----------------------------------------------------------------------------------------

function Linker(root){
	this.root = root;
	this.code = [];
	this.internMap = new Map();
	this.symbols = {
		lines: [],
		locals: [],
		localsMap: new Map()
	};
}

Linker.prototype.resolvePathAbs = function(context,path){
	var ctx = context;
	var code = [];
	if(ctx){
		while(true){
			if(path[0] == 'parent'){
				// to do: better error msg
				if(!ctx.parent)
					throw new Error('root has no parent');
				ctx = ctx.parent;
				path.shift();
			}else if(ctx.children.has(path[0])){
				ctx = ctx.children.get(path[0]);
				path.shift();
			}else{
				break;
			}
		}
		code = ctx.id > 0xFFFF ? [vm.opc16(vm.op.PUSH_VALUE,ctx.type,0),ctx.id] : [vm.opc16(vm.op.PUSH_CONST,ctx.type,ctx.id)];
	}
	path.forEach(name=>{
		if(name == 'parent'){
			code.push(vm.opc24(vm.op.PUSH_PARENT,0));
		}else{
			var mmid = this.intern(name);
			if(mmid > 0xFFFFFF){
				code.push(vm.opc16(vm.op.PUSH_VALUE,vm.type.STRING,0),mmid,vm.opc24(vm.op.PUSH_MEMBER_UNSAFE,0));
			}else{
				code.push(vm.opc24(vm.op.PUSH_MEMBER_CONST,mmid));
			}
		}
	});
	return code;
};

Linker.prototype.resolvePath = function(context,path){
	path = typeof path === "string" ? path.split('.') : path;
	if(path[0] == '')
		return this.resolvePathAbs(null,path.slice(1));
	if(path[0] == 'root')
		return this.resolvePathAbs(this.root,path.slice(1));
	if(path[0] == 'self')
		return this.resolvePathAbs(context,path.slice(1));
	if(path[0] == 'parent')
		return this.resolvePathAbs(context,path);
	var ctx = context;
	while(ctx){
		if(ctx.children.has(path[0]))
			return this.resolvePathAbs(ctx.children.get(path[0]),path.slice(1));
		ctx = ctx.parent;
	}
	// to do: better error msg
	throw new Error(`can not resolve path ${path.join('.')}`);
};

Linker.prototype.link = function(file){
	var labels = new Map();
	var lookback = [];
	var context = null;
	var code = file.code;
	for(var i=0; i<code.length; i++){
		var opc = code[i];
		switch(vm.getOp(opc)){
			case vm.op.PUSH_VALUE:
				var value = code[i+1];
				var type = vm.getType(opc);
				if(type == vm.type.STRING)
					value = this.intern(file.strings[value]);
				else if(vm.isType(type,vm.type.OBJECT))
					value = file.objects[value].id;
				if(value > 0xFFFF){
					this.pushOpc(opc);
					this.pushOpc(value);
				}else{
					this.pushOpc(vm.opc16(vm.op.PUSH_CONST,type,value));
				}
				i += 1;
				break;
			case vm.op.LABEL:
				labels.set(vm.getValue24(opc),this.offset);
				break;
			case vm.op.LINE:
				this.pushLine(vm.getValue24(opc));
				break;
			case vm.op.LOCAL:
				this.pushLocal(vm.getValue24S(opc),file.strings[code[++i]]);
				break;
			case vm.op.JMP_L:
			case vm.op.JE_L:
			case vm.op.JNE_L:
				var jmp_op = vm.getOp(opc)-vm.op.JMP_L+vm.op.JMP;
				if(labels.has(vm.getValue24(opc))){
					this.pushOpc(vm.opc24(jmp_op,labels.get(vm.getValue24(opc))-this.offset));
				}else{
					lookback.push(this.offset);
					this.pushOpc(vm.opc24(jmp_op,vm.getValue24(opc)));
				}
				break;
			case vm.op.PUSH:
				if(context === null)
					throw new Error("null context!");
				this.pushOpc(this.resolvePath(context,file.strings[vm.getValue24(opc)]));
				break;
			case vm.op.SET:
				if(context === null)
					throw new Error("null context!");
				var path = file.strings[vm.getValue24(opc)].split('.');
				this.pushOpc(this.resolvePath(context,path.slice(0,-1)));
				var mmid = this.intern(path.pop());
				if(mmid > 0xFFFFFF){
					this.pushOpc(vm.opc16(vm.op.PUSH_VALUE,vm.type.STRING,0));
					this.pushOpc(mmid);
					this.pushOpc(vm.opc24(vm.op.SET_MEMBER_UNSAFE,0));
				}else{
					this.pushOpc(vm.opc24(vm.op.SET_MEMBER_CONST,mmid));
				}
				break;
			case vm.op.FUNCTION:
				lookback.forEach(offset=>{
					var opc = this.getOpc(offset);
					this.setOpc(offset,vm.opc24(vm.getOp(opc),labels.get(vm.getValue24(opc))-offset));
				});
				lookback = [];
				labels = new Map();
				context = file.objects[vm.getValue24(opc)];
				context.offset = this.offset;
				break;
			default:
				this.pushOpc(opc);
		}
	}
};

Linker.prototype.intern = function(str){
	var map = this.internMap;
	if(map.has(str))
		return map.get(str);
	var s = map.size;
	map.set(str,s);
	return s;
};

Linker.prototype.pushOpc = function(opc){
	if(opc.constructor == Array)
		Array.prototype.push.apply(this.code,opc);
	else
		this.code.push(opc);
	this.offset = this.code.length;
};


Linker.prototype.getOpc = function(offset){
	return this.code[offset];
};


Linker.prototype.setOpc = function(offset,opc){
	this.code[offset] = opc;
};

Linker.prototype.pushLine = function(line){
	this.symbols.lines.push(this.offset,line);
};

Linker.prototype.pushLocal = function(sp,str){
	var map = this.symbols.localsMap;
	if(map.has(str))
		this.symbols.locals.push(this.offset,sp,map.get(str));
	var s = map.size;
	map.set(str,s);
	this.symbols.locals.push(this.offset,sp,s);
};

var data = glob.sync("*.json",{cwd:cwd+'/__output/object'}).map(file=>{
	var json = JSON.parse(fs.readFileSync(cwd+'/__output/object/'+file));
	json.base = file.replace(/\.?[^.]+\.json$/,'');
	var code = fs.readFileSync(cwd+'/__output/object/'+file.replace(/\.json$/,'.o'));
	json.code = new Uint32Array(code.buffer,code.byteOffset,code.length>>2);
	json.path = file;
	return json;
});

function createObjectTree(data){
	var root = {
		name:'root',
		type:vm.type.NAMESPACE,
		parent:null,
		children:new Map(),
		file:null,
		constructors: [],
		id: 0,
	};
	var id = 1;
	data.forEach(file => {
		var base = root;
		if(file.base){
			file.base.split('.').forEach(name=>{
				if(base.children.has(name)){
					base = base.children.get(name);
				}else{
					var ns = {
						name:name,
						type:vm.type.NAMESPACE,
						parent:base,
						children:new Map(),
						file:null,
						constructors:[],
						id: id++
					};
					base.children.set(name,ns);
					base = ns;
				}
			});
		}
		var localroot = null;
		file.objects.forEach(o=>{
			o.name = file.strings[o.name];
			o.children = new Map();
			o.file = file.path;
			o.constructors = [];
			o.id = id++;
			if(o.parent===null){
				base.constructors.push(o);
				localroot = o;
			}else if(!vm.isType(o.type,vm.type.FUNCTION)){ // todo: change to type.CALLABLE (?)
				o.constructors.push(o);
			}
		});
		file.objects.forEach(o=>{
			o.parent = o.parent===null?base:file.objects[o.parent];
			if(o.parent == localroot)
				o.parent = base;
			if(o != localroot){
				// to do: better error
				if(o.parent.children.has(o.name))
					throw new Error('link error, object redefined');
				o.parent.children.set(o.name,o);
			}
		});
		base.constructors.push(localroot);
	});
	return root;
}

var linker = new Linker(createObjectTree(data));
data.forEach(file => {
	//console.log(Array.from(file.code).map(opc=>vm.getOpName(vm.getOp(opc))));
	linker.link(file);
});
var code = new Uint32Array(linker.code);
fs.writeFileSync('output.bin',Buffer(code.buffer));
//linker.writeMemory(cwd+'memory.bin');
//ćlinker.writeSymbols(cwd+'symbols.json');
//console.log(util.inspect(root, false, null));
