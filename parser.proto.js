/*! AdventureScript Parser v0.2.0 | MIT License | (c) 2017 Marek Korzeniowski */
/*jshint freeze:true, latedef:true, nocomma:false, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, esversion:6, loopfunc: true*/
"use strict";
module.exports = function(parser){

//---------------------------------------------------------------------------------------
// constants
//---------------------------------------------------------------------------------------

const vm = require('./defines.js');

const EXPRLOOKUP = {
	'|':vm.op.BOR,'^':vm.op.BXOR,'&':vm.op.BAND,'==':vm.op.EQ,'===':vm.op.EQEQ,'!=':vm.op.NEQ,'!==':vm.op.NEQNEQ,
	'<':vm.op.GT,'<=':vm.op.GE,'>':vm.op.LT,'>=':vm.op.LE,'<<':vm.op.SHR,'>>':vm.op.SHL,'+':vm.op.ADD,
	'-':vm.op.SUB,'*':vm.op.MUL,'/':vm.op.DIV,'%':vm.op.MOD,'!':vm.op.NOT,'~':vm.op.BNOT,'~~':vm.op.NEG
};

function intern(map,str){
	if(map.has(str))
		return map.get(str);
	map.set(str,map.size);
	return map.size-1;
}

//---------------------------------------------------------------------------------------
// Parser prototype extension
//---------------------------------------------------------------------------------------

parser._parse = parser.parse;
parser.parse = function(input){
	this.lexer.reset();
	this.objects = [];
	this.strings = new Map();
	this.code = [];
	this._parse(input.replace(/\r\n/g,'\n'));
	this.code = new Uint32Array(Array.prototype.concat.apply([],this.code));
};

parser.error = function(tok,msg){
	var ln = tok.first_line || 'unknown';
	var e = new Error(`Syntax error on line ${ln}: ${msg}`);
	e.hash = {'line':isNaN(ln)?undefined:ln-1,'loc':tok};
	throw e;
};

parser.wrapblock = function(block){
	block.unshift(vm.opc24(vm.op.BLKOPEN,0));
	block.push(vm.opc24(vm.op.BLKCLOSE,0));
	return block;
};

parser.atom = function(str){
	if(str === 'false')
		return [vm.opc16(vm.op.PUSH_VALUE,vm.type.BOOLEAN,0),0];
	if(str === 'true')
		return [vm.opc16(vm.op.PUSH_VALUE,vm.type.BOOLEAN,0),1];
	return [vm.opc16(vm.op.PUSH_VALUE,vm.type.UNDEFINED,0),0];
};

parser.number = function(tok,str){
	var n = parseFloat(str,10);
	if(isNaN(n) || n === Infinity || n === -Infinity)
		this.error(tok,"'"+str+"' equlas to "+n);
	if(n == Math.floor(n)){
		if(isNaN(n) || n === Infinity || n === -Infinity)
			this.error(tok,`'${str}' equlas to ${n}`);
		if(n > 0x7FFFFFFF || n < -2147483648)
			this.error(tok,`'${str}' overflows a 32bit integer`);
		return [vm.opc16(vm.op.PUSH_VALUE,vm.type.INTEGER,0),n];
	}
	var buffer = new ArrayBuffer(4);
	var intview = new Int32Array(buffer);
	var floatview = new Float32Array(buffer);
	floatview[0] = n;
	return [vm.opc16(vm.op.PUSH_VALUE,vm.type.FLOAT,0),intview[0]];
};

parser.hex = function(tok,str){
	var n = parseInt(str.slice(2),16);
	if(isNaN(n) || n === Infinity || n === -Infinity)
		this.error(tok,`'${str}' equlas to ${n}`);
	if(n > 0x7FFFFFFF || n < -2147483648)
		this.error(tok,`'${str}' overflows a 32bit integer`);
	return [vm.opc16(vm.op.PUSH_VALUE,vm.type.INTEGER,0),n];
};

parser.bin = function(tok,str){
	var n = parseInt(str.slice(2),2);
	if(isNaN(n) || n === Infinity || n === -Infinity)
		this.error(tok,"'"+str+"' equlas to "+n);
	if(n > 0x7FFFFFFF || n < -2147483648)
		this.error(tok,`'${str}' overflows a 32bit integer`);
	return [vm.opc16(vm.op.PUSH_VALUE,vm.type.INTEGER,0),n];
};

parser.varname = function(tok,name){
	return [vm.opc24(vm.op.PUSH,0),name,vm.opc24(vm.op.LINE,tok.first_line)];
};

parser.array = function(tok,args){ /*jshint ignore:line*/
	throw new Error('todo');
};

parser.string = function(arg){
	return [vm.opc16(vm.op.PUSH_VALUE,vm.type.STRING,0),intern(this.strings,arg)];
};

parser.whileblock = function(tok,expression,body){
	expression.unshift(vm.opc24(vm.op.LABEL,0));
	expression.push(vm.opc24(vm.op.JNE_L,1), vm.opc24(vm.op.LINE,tok.first_line));
	for(var i=0; i<body.length; i++){
		var opc = body[i];
		switch(vm.getOp(opc)){
		case vm.op.PUSH_VALUE:
		case vm.op.PUSH:
		case vm.op.SET:
			expression.push(body[i++]);
			expression.push(body[i]);
			break;
		case vm.op.BREAK:
			expression.push(vm.opc24(vm.op.JMP_L,1));
			break;
		case vm.op.CONTINUE:
			expression.push(vm.opc24(vm.op.JMP_L,0));
			break;
		default:
			expression.push(body[i]);
		}
	}
	expression.push(vm.opc24(vm.op.JMP_L,0),vm.opc24(vm.op.LABEL,1));
	return this.wrapblock(expression);
};

parser.ifblock = function(tok,expression,iftrue,iffalse){
	if(iffalse){
		expression.push(vm.opc24(vm.op.JNE_L,0),vm.opc24(vm.op.LINE,tok.first_line));
		expression.push.apply(expression,iftrue);
		expression.push(vm.opc24(vm.op.JMP_L,1),vm.opc24(vm.op.LABEL,0));
		expression.push.apply(expression,iffalse);
		expression.push(vm.opc24(vm.op.LABEL,1));
	}else{
		expression.push(vm.opc24(vm.op.JNE_L,0),vm.opc24(vm.op.LINE,tok.first_line));
		expression.push.apply(expression,iftrue);
		expression.push(vm.opc24(vm.op.LABEL,0));
	}
	return this.wrapblock(expression);
};

parser.expr = function(tok,left,op,right){
	if(op == '&&' || op == '||'){
		//short-circut implementation
		left.push(vm.opc24(vm.op.DUP,0));
		if(op == '||')
			left.push(vm.opc24(vm.op.JE_L,0));
		else
			left.push(vm.opc24(vm.op.JNE_L,0));
		left.push(vm.opc24(vm.op.DEALLOC,1));
		left.push.apply(left,right);
		left.push(vm.opc24(vm.op.LABEL,0),vm.opc24(vm.op.LINE,tok.first_line));
		return this.wrapblock(left);
	}
	var o = [];
	if(left)
		o.push.apply(o,left);
	if(right)
		o.push.apply(o,right);
	o.push(vm.opc24(EXPRLOOKUP[op],0),vm.opc24(vm.op.LINE,tok.first_line));
	return o;
};

parser.exprcall = function(tok,args){
	var o = (args.length>1)?Array.prototype.concat.apply([],args.slice(1)):[];
	Array.prototype.push.apply(o,args[0]);
	o.push(vm.opc24(vm.op.CALL,args.length-1),vm.opc24(vm.op.LINE,tok.first_line));
	return o;
};

parser.index = (tok,object,key) => Array.prototype.concat(object,key,[vm.opc24(vm.op.PUSH_MEMBER,0),vm.opc24(vm.op.LINE,tok.first_line)]);

parser.c_con = tok => [vm.opc24(vm.op.CONTINUE,0),vm.opc24(vm.op.LINE,tok.first_line)];

parser.c_bre = tok => [vm.opc24(vm.op.BREAK,0),vm.opc24(vm.op.LINE,tok.first_line)];

parser.c_thr = (tok,val) => (val.push(vm.opc24(vm.op.THROW,0),vm.opc24(vm.op.LINE,tok.first_line)), val);

parser.c_yie = (tok,val) => (val.push(vm.opc24(vm.op.YIELD,0),vm.opc24(vm.op.LINE,tok.first_line)), val);

parser.c_ret = (tok,val) => (val.push(vm.opc24(vm.op.RET,0),vm.opc24(vm.op.LINE,tok.first_line)), val);

parser.c_call = function(tok,name,args){
	var o = Array.prototype.concat.apply([],args);
	if(typeof name === 'object')
		Array.prototype.push.apply(o,name);
	else
		o.push(vm.opc24(vm.op.PUSH,0),name);
	o.push(vm.opc24(vm.op.CALL,args.length),vm.opc24(vm.op.LINE,tok.first_line),vm.opc24(vm.op.DEALLOC,1));
	return o;
};

parser.c_local = function(tok,name,value){
	if(name.indexOf('.')>=0)
		this.error(tok,`'${name}' contains a '.' character and thus can not be used as a local`);
	var o = [vm.opc24(vm.op.LOCAL,0),name];
	if(value !== null){
		Array.prototype.push.apply(o,value);
		o.push(vm.opc24(vm.op.SET,0),name);
	}
	return o;
};

parser.c_set = (tok,name,value) => (value.push(vm.opc24(vm.op.SET,0),name,vm.opc24(vm.op.LINE,tok.first_line)),value);

parser.c_mset = (tok,object,key,value) => Array.prototype.concat(value,object,key,[vm.opc24(vm.op.SET_MEMBER,0),vm.opc24(vm.op.LINE,tok.first_line)]);

parser.addfunc = function(tok,name,body,args,type){
	var head = [vm.opc24(vm.op.FUNCTION,this.objects.length)];
	var tail = [];
	var symbols = new Map();
	args.forEach((arg,i)=>{
		var a = arg.split('::');
		head.push(vm.opc24(vm.op.LOCAL,(i-args.length+1)&0xFFFFFF),intern(this.strings,a[0]));
		if(a[1]){
			head.push(vm.opc16(vm.op.ASSERT_TYPE,vm.type[a[1].toUpperCase()],(i-args.length+1)&0xFFFF));
		}
		symbols.set(a[0],[(i-args.length+1)&0xFFFFFF]);
	});
	head.push(vm.opc24(vm.op.ASSERT_ARRITY_EQ,args.length),vm.opc24(vm.op.LINE,tok.first_line));
	var localcnt = 0;
	var maxcnt = 0;
	var stack = [];
	var labels = new Map();
	var labelcnt = 0;
	var locals = [];
	var lines = new Map();
	for(var i=0; i<body.length; i++){
		var opc = body[i];
		switch(vm.getOp(opc)){
			case vm.op.PUSH_VALUE:
				tail.push(opc);
				tail.push(body[i+1]);
				i += 1;
				break;
			case vm.op.BLKOPEN:
				stack.push(locals,labels);
				locals = [];
				labels = new Map();
				break;
			case vm.op.BLKCLOSE:
				locals.forEach(x=>symbols.get(x).shift());
				localcnt -= locals.length;
				labels = stack.pop();
				locals = stack.pop();
				break;
			case vm.op.LABEL:
			case vm.op.JMP_L:
			case vm.op.JE_L:
			case vm.op.JNE_L:
				var lbl = vm.getValue24(opc);
				if(!labels.has(lbl))
					labels.set(lbl,labelcnt++);
				tail.push(vm.opc24(vm.getOp(opc),labels.get(lbl)));
				break;
			case vm.op.LOCAL:
				var l = body[++i];
				if(locals.indexOf(l) >= 0)
					throw new Error(`local variable '${l}' redefined`);
				locals.push(l);
				if(symbols.has(l))
					symbols.get(l).unshift(localcnt);
				else
					symbols.set(l,[localcnt+1]);
				localcnt++;
				maxcnt = Math.max(localcnt,maxcnt);
				tail.push(vm.opc24(vm.op.LOCAL,localcnt),intern(this.strings,l));
				break;
			case vm.op.LINE:
				lines.set(vm.getValue24(opc,tail.length));
				tail.push(opc);
				break;
			case vm.op.PUSH:
			case vm.op.SET:
				var l = body[++i]; /* jshint ignore:line */
				if(symbols.has(l) && symbols.get(l).length > 0)
					tail.push(vm.opc24(vm.getOp(opc)==vm.op.PUSH?vm.op.PUSH_LOCAL:vm.op.SET_LOCAL,symbols.get(l)[0]));
				else{
					var base = l.split('.')[0];
					if(symbols.has(base) && symbols.get(base).length > 0){
						tail.push(vm.opc24(vm.op.PUSH_LOCAL,symbols.get(base)[0]));
						tail.push(vm.opc24(vm.getOp(opc),intern(this.strings,l.slice(base.length))));
					}else{
						tail.push(vm.opc24(vm.getOp(opc),intern(this.strings,l)));
					}
				}
				break;
			case vm.op.OBJECT:
				this.objects[vm.getValue24(opc)].parent = this.objects.length;
				break;
			case vm.op.CONTINUE:
				this.error(tok,"continue outside loop");
				break;
			case vm.op.BREAK:
				this.error(tok,"break outside loop");
				break;
			default:
				tail.push(opc);
		}
	}
	tail.push(vm.opc16(vm.op.PUSH_VALUE,vm.type.UNDEFINED,0),0,vm.opc24(vm.op.RET,0));
	if(maxcnt > 0)
		head.push(vm.opc24(vm.op.ALLOC,maxcnt));
	for(var i=0; i<tail.length; i++){ /* jshint ignore:line */
		var opc = tail[i]; /* jshint ignore:line */
		switch(opc){
			case vm.op.PUSH_VALUE:
			case vm.op.LOCAL:
				head.push(opc);
				head.push(tail[i+1]);
				i += 1;
				break;
			case vm.op.LINE:
				if(lines.get(vm.getValue24(opc)) == i)
					head.push(opc);
				break;
			default:
				head.push(opc);
		}
	}
	this.code.push(head);
	this.objects.push({
		name:intern(this.strings,name),
		type:type,
		parent:null,
	});
	return [vm.opc24(vm.op.OBJECT,this.objects.length-1)];
};

parser.func = function(tok,name,args,body){
	var o = this.addfunc(tok,name,body,args,vm.type.FUNCTION);
	o.push(
		vm.opc16(vm.op.PUSH_VALUE,vm.type.FUNCTION,0),this.objects.length-1,
		vm.opc24(vm.op.SET,0),'self.'+name
	);
	return o;
};

parser.namespace = function(tok,name,body){
	var o = this.addfunc(tok,name,body,[],vm.type.NAMESPACE);
	o.push(
		vm.opc16(vm.op.PUSH_VALUE,vm.type.NAMESPACE,0),this.objects.length-1,
		vm.opc24(vm.op.DUP,0),vm.opc24(vm.op.SET,0),'self.'+name,
		vm.opc24(vm.op.CALL_UNSAFE,0),vm.opc24(vm.op.DEALLOC,1)
	);
	return o;
};

};
