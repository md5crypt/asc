/*! AdventureScript Parser v0.2.0 | MIT License | (c) 2017 Marek Korzeniowski */

%right '?' ':'
%left '||'
%left '&&'
%left '|'
%left '^'
%left '&'
%left '===' '==' '!=' '!=='
%left '<' '<=' '>=' '>'
%left '<<' '>>'
%left '--' EXPR
%left '+' '-'
%left '*' '/' '%'
%right '!' '~' NEG

%right 'THEN' 'ELSEIF' 'ELSE'
%%

//------------------------------------------------------------

file: program | NL program ;

program:
	statments
		{ compiler.function(@1,'@main',compiler.wrapBlock($1)); }
;

//------------------------------------------------------------


object:
	FUNCTION VARNAME arguments fblock
		{ $$ = compiler.function(@1,$2,$4,$3); } |
	NAMESPACE VARNAME nullblock
		{ $$ = compiler.namespace(@1,$2,$3); } |
	EXTERN VARNAME STRING NL
		{ $$ = compiler.extern(@1,$2,$3); }
;

arguments:
	VARNAME arguments
		{ $$ = $2; $$.unshift({name:$1}); } |
	VARNAME TYPE arguments
		{ $$ = $3; $$.unshift({name:$1,type:$2}); } |
	VARNAME '?' optarguments
		{ $$ = $3; $$.unshift({name:$1,optional:true}); } |
	VARNAME '?' TYPE optarguments
		{ $$ = $4; $$.unshift({name:$1,type:$3,optional:true}); } |
	'...' VARNAME
		{ $$ = [{name:$2,variadic:true,optional:true}]; } |
	/* empty */
		{ $$ = []; }
;

optarguments:
	VARNAME '?' optarguments
		{ $$ = $3; $$.unshift({name:$1,optional:true}); } |
	VARNAME '?' TYPE optarguments
		{ $$ = $4; $$.unshift({name:$1,type:$3,optional:true}); } |
	'...' VARNAME
		{ $$ = [{name:$2,variadic:true,optional:true}]; } |
	/* empty */
		{ $$ = []; }
;

//------------------------------------------------------------

body:
	fblock
		{ $$ = $1; } |
	IF ifexpression
		{ $$ = $2; } |
	WHILE whileexpression
		{ $$ = $2; } |
	command NL
		{ $$ = compiler.wrapBlock($1); } |
	NL
		{ $$ = compiler.wrapBlock(); }
;

block:
	INDT statments DEDT
		{ $$ = compiler.wrapBlock($2); }
;

fblock:
	INDT fstatments DEDT
		{ $$ = compiler.wrapBlock($2); }
;

nullblock: block | NL { $$ = compiler.wrapBlock([]); } ;

statments:
	statments object
		{ $$ = $1; $$.push(...$2); } |
	statments command NL
		{ $$ = $1; $$.push(...$2); } |
	statments IF ifexpression
		{ $$ = $1; $$.push(...$3); } |
	statments WHILE whileexpression
		{ $$ = $1; $$.push(...$3); } |
	/* empty */
		{ $$ = []; }
;

fstatments:
	fstatments command NL
		{ $$ = $1; $$.push(...$2); } |
	fstatments IF ifexpression
		{ $$ = $1; $$.push(...$3); } |
	fstatments WHILE whileexpression
		{ $$ = $1; $$.push(...$3); } |
	/* empty */
		{ $$ = []; }
;


//------------------------------------------------------------

ifexpression:
	expression body %prec THEN
		{ $$ = compiler.ifBlock(@1,$1,$2); } |
	expression body ELSE body
		{ $$ = compiler.ifBlock(@1,$1,$2,$4); } |
	expression command ELSE body
		{ $$ = compiler.ifBlock(@1,$1,compiler.wrapBlock($2),$4); } |
	expression body ELSEIF ifexpression
		{ $$ = compiler.ifBlock(@1,$1,$2,$4); } |
	expression command ELSEIF ifexpression
		{ $$ = compiler.ifBlock(@1,$1,compiler.wrapBlock($2),$4); }
;

//------------------------------------------------------------

whileexpression:
	expression body
		{ $$ = compiler.whileBlock(@2,$1,$2); }
;

//------------------------------------------------------------

safeexpr: expression %prec EXPR ;

exprlist:
	exprlist safeexpr
		{ $$ = $1; $$.push($2); } |
	/* empty */
		{ $$ = []; }
;

expression:
	'('	expression ')'
		{ $$ = $2 } |
	'(' safeexpr expression ')'
		{ $$ = compiler.index(@1,$2,$3); } |
	expression '||' expression
		{ $$ = compiler.expression(@1,'||',$1,$3); } |
	expression '&&' expression
		{ $$ = compiler.expression(@1,'&&',$1,$3); } |
	expression '|' expression
		{ $$ = compiler.expression(@1,'|',$1,$3); } |
	expression '^' expression
		{ $$ = compiler.expression(@1,'^',$1,$3); } |
	expression '&' expression
		{ $$ = compiler.expression(@1,'&',$1,$3); } |
	expression '==' expression
		{ $$ = compiler.expression(@1,'==',$1,$3); } |
	expression '===' expression
		{ $$ = compiler.expression(@1,'===',$1,$3); } |
	expression '!=' expression
		{ $$ = compiler.expression(@1,'!=',$1,$3); } |
	expression '!==' expression
		{ $$ = compiler.expression(@1,'!==',$1,$3); } |
	expression '<' expression
		{ $$ = compiler.expression(@1,'<',$1,$3); } |
	expression '<=' expression
		{ $$ = compiler.expression(@1,'<=',$1,$3); } |
	expression '>=' expression
		{ $$ = compiler.expression(@1,'>=',$1,$3); } |
	expression '>' expression
		{ $$ = compiler.expression(@1,'>',$1,$3); } |
	expression '<<' expression
		{ $$ = compiler.expression(@1,'<<',$1,$3); } |
	expression '>>' expression
		{ $$ = compiler.expression(@1,'>>',$1,$3); } |
	expression '+' expression
		{ $$ = compiler.expression(@1,'+',$1,$3); } |
	expression '-' expression
		{ $$ = compiler.expression(@1,'-',$1,$3); } |
	expression '--' expression
		{ $$ = compiler.expression(@1,'--',$1,$3); } |
	expression '*' expression
		{ $$ = compiler.expression(@1,'*',$1,$3); } |
	expression '/' expression
		{ $$ = compiler.expression(@1,'/',$1,$3); } |
	expression '%' expression
		{ $$ = compiler.expression(@1,'%',$1,$3); } |
	'!' expression
		{ $$ = compiler.expression(@1,'!',$2); } |
	'~' expression
		{ $$ = compiler.expression(@1,'~',$2); } |
	'-' expression %prec NEG
		{ $$ = compiler.expression(@1,'~~',$2); } |
	'--' expression %prec NEG
		{ $$ = compiler.expression(@1,'~~',$2); } |
	expression '?' expression ':' expression
		{ $$ = compiler.ifBlock(@2,$1,$3,$5); } |
	'{' safeexpr exprlist '}'
		{ $3.unshift($2); $$ = compiler.expressionCall(@1,$3); } |
	'[' exprlist ']'
		{ $$ = compiler.array(@1,$2); } |
	VARNAME
		{ $$ = compiler.varname(@1,$1); } |
	NUMBER
		{ $$ = compiler.number(@1,$1); } |
	HEXNUMBER
		{ $$ = compiler.hex(@1,$1); } |
	BINNUMBER
		{ $$ = compiler.bin(@1,$1); } |
	ATOM
		{ $$ = compiler.atom($1); } |
	STRING
		{ $$ = compiler.string($1); }
;

//------------------------------------------------------------

command:
	'{' safeexpr exprlist '}' exprlist
		{ $3.unshift($2); $$ = compiler.call(@1,compiler.expressionCall(@1,$3),$5); } |
	VARNAME exprlist
		{ $$ = compiler.call(@1,$1,$2); } |
	CONTINUE
		{ $$ = compiler.continue(@1); } |
	YIELD expression
		{ $$ = compiler.yield(@1,$2); } |
	BREAK
		{ $$ = compiler.break(@1); } |
	RETURN
		{ $$ = compiler.return(@1); } |
	RETURN expression
		{ $$ = compiler.return(@1,$2); } |
	THROW
		{ $$ = compiler.throw(@1); } |
	THROW expression
		{ $$ = compiler.throw(@1,$2); } |
	LOCAL VARNAME
		{ $$ = compiler.local(@1,$2); } |
	LOCAL VARNAME '=' expression
		{ $$ = compiler.local(@1,$2,$4); } |
	SET VARNAME
		{ $$ = compiler.set(@1,$2,true); } |
	SET '(' safeexpr expression ')'
		{ $$ = compiler.memberSet(@1,$3,$4,true); } |
	SET VARNAME '=' expression
		{ $$ = compiler.set(@1,$2,$4); } |
	SET '(' safeexpr expression ')' '=' expression
		{ $$ = compiler.memberSet(@1,$3,$4,$7); } |
	UNSET VARNAME
		{ $$ = compiler.set(@1,$2,false); } |
	UNSET '(' safeexpr expression ')'
		{ $$ = compiler.memberSet(@1,$3,$4,false); }
;

%%
const compiler = new (require('./Compiler').Compiler)();
exports.compiler = compiler;
parser._parse = parser.parse;
parser.parse = function(input){
	compiler.reset()
	this.lexer.reset();
	this._parse(input.replace(/\r\n/g,'\n'));
};
