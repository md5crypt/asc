/*! AdventureScript Parser v0.2.0 | MIT License | (c) 2017 Marek Korzeniowski */

%right '?' ':'
%left '||'
%left '&&'
%left '|'
%left '^'
%left '&'
%left '===' '==' '!=' '!=='
%left '<' '<=' '>=' '>'
%left '<<' '>>' '>>>'
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
		{ compiler.function(@1,'@main',compiler.wrapBlock($1)) }
;

//------------------------------------------------------------

object:
	SCOPE VARNAME nullblock
		{ $$ = compiler.scope(@1,$2,$3) } |
	modifiers FUNCTION VARNAME arguments block
		{ $$ = compiler.function(@2,$3,$5,$4,$1) } |
	modifiers NAMESPACE VARNAME nullblock
		{ $$ = compiler.namespace(@2,$3,$4,$1) } |
	modifiers LOCATION VARNAME nullblock
		{ $$ = compiler.namespaceLocation(@2,$3,$4,$1) } |
	modifiers OBJECT VARNAME string nullblock
		{ $$ = compiler.namespaceObject(@2,$3,$4,$5,$1) } |
	modifiers OBJECT VARNAME nullblock
		{ $$ = compiler.namespaceObject(@2,$3,null,$4,$1) } |
	EXTERN VARNAME STRING NL
		{ $$ = compiler.extern(@1,$2,$3) }
;

arguments:
	VARNAME arguments
		{ $$ = $2; $$.unshift({name:$1}) } |
	VARNAME ':' type arguments
		{ $$ = $4; $$.unshift({name:$1,type:$3}) } |
	VARNAME '?' optarguments
		{ $$ = $3; $$.unshift({name:$1,optional:true}) } |
	VARNAME '?' ':' type optarguments
		{ $$ = $5; $$.unshift({name:$1,type:$4,optional:true}) } |
	'...' VARNAME
		{ $$ = [{name:$2,variadic:true}] } |
	'...'
		{ $$ = [{variadic:true}] } |
	/* empty */
		{ $$ = [] }
;

optarguments:
	VARNAME '?' optarguments
		{ $$ = $3; $$.unshift({name:$1,optional:true}) } |
	VARNAME '?' ':' type optarguments
		{ $$ = $5; $$.unshift({name:$1,type:$4,optional:true}) } |
	/* empty */
		{ $$ = [] }
;

modifiers:
	modifiers '@' VARNAME
		{ $$ = $1; $1.push($3) } |
	/* empty */
		{ $$ = [] };

type: VARNAME | NAMESPACE | OBJECT | FUNCTION ;

//------------------------------------------------------------

body:
	INDT fstatments DEDT
		{ $$ = compiler.wrapBlock($2) } |
	blockexpression
		{ $$ = $1 } |
	command NL
		{ $$ = compiler.wrapBlock($1) } |
	NL
		{ $$ = compiler.wrapBlock() }
;

block:
	INDT statments DEDT
		{ $$ = compiler.wrapBlock($2) }
;

nullblock: block | NL { $$ = compiler.wrapBlock([]) } ;

statments:
	statments object
		{ $$ = $1; $$.push(...$2) } |
	statments command NL
		{ $$ = $1; $$.push(...$2) } |
	statments blockexpression
		{ $$ = $1; $$.push(...$2) } |
	statments importexpression
		{ $$ = $1; $$.push(...$2) } |
	/* empty */
		{ $$ = [] }
;

fstatments:
	fstatments command NL
		{ $$ = $1; $$.push(...$2) } |
	fstatments blockexpression
		{ $$ = $1; $$.push(...$2) } |
	/* empty */
		{ $$ = [] }
;

//------------------------------------------------------------

blockexpression: ifexpression | whileexpression | forexpression | setexpression ;

//------------------------------------------------------------

setexpression:
	  IN VARNAME SET INDT setpairs DEDT
	  	{ $$ = compiler.setBlock(@1,$2,$5) }
;

setpairs:
	setpairs VARNAME '=' expression NL
		{ $1.push({key:$2,value:$4,tok:@2}); $$ = $1 } |
	VARNAME '=' expression NL
		{ $$ = [{key:$1,value:$3,tok:@1}] }
;

//------------------------------------------------------------

importexpression:
 	IMPORT VARNAME NL
		{ $$ = compiler.import(@1,$2) } |
	IMPORT importlist FROM VARNAME NL
		{ $$ = compiler.import(@1,$2,$4) } |
	IMPORT '[' importlist ']' FROM VARNAME NL
		{ $$ = compiler.import(@1,$3,$6) }
;

importlist:
	importlist VARNAME
		{ $$ = $1; $1.push($2) } |
	VARNAME
		{ $$ = [$1] }
;

//------------------------------------------------------------

ifexpression: IF ifbody { $$ = $2 } ;
ifbody:
	expression body %prec THEN
		{ $$ = compiler.ifBlock(@1,$1,$2) } |
	expression body ELSE body
		{ $$ = compiler.ifBlock(@1,$1,$2,$4) } |
	expression command ELSE body
		{ $$ = compiler.ifBlock(@1,$1,compiler.wrapBlock($2),$4) } |
	expression body ELSEIF ifbody
		{ $$ = compiler.ifBlock(@1,$1,$2,$4) } |
	expression command ELSEIF ifbody
		{ $$ = compiler.ifBlock(@1,$1,compiler.wrapBlock($2),$4) }
;

//------------------------------------------------------------

whileexpression:
	WHILE expression body
		{ $$ = compiler.whileBlock(@1,$2,$3) }
;

//------------------------------------------------------------

forexpression:
	FOR VARNAME IN expression body
		{ $$ = compiler.forBlock(@1,$5,$2,$4) } |
	FOR VARNAME IN expression ':' expression body
		{ $$ = compiler.forBlockNumeric(@1,$7,$2,$4,$6) } |
	FOR VARNAME IN expression ':' expression ':' expression body
		{ $$ = compiler.forBlockNumeric(@1,$9,$2,$4,$6,$8) }
;

//------------------------------------------------------------

safeexpr: expression %prec EXPR ;

exprlist:
	exprlist safeexpr
		{ $$ = $1; $$.push($2) } |
	/* empty */
		{ $$ = [] }
;

expression:
	'('	expression ')'
		{ $$ = $2 } |
	'(' safeexpr expression ')'
		{ $$ = compiler.index(@1,$2,$3) } |
	expression '||' expression
		{ $$ = compiler.expression(@1,'||',$1,$3) } |
	expression '&&' expression
		{ $$ = compiler.expression(@1,'&&',$1,$3) } |
	expression '|' expression
		{ $$ = compiler.expression(@1,'|',$1,$3) } |
	expression '^' expression
		{ $$ = compiler.expression(@1,'^',$1,$3) } |
	expression '&' expression
		{ $$ = compiler.expression(@1,'&',$1,$3) } |
	expression '==' expression
		{ $$ = compiler.expression(@1,'==',$1,$3) } |
	expression '===' expression
		{ $$ = compiler.expression(@1,'===',$1,$3) } |
	expression '!=' expression
		{ $$ = compiler.expression(@1,'!=',$1,$3) } |
	expression '!==' expression
		{ $$ = compiler.expression(@1,'!==',$1,$3) } |
	expression '<' expression
		{ $$ = compiler.expression(@1,'<',$1,$3) } |
	expression '<=' expression
		{ $$ = compiler.expression(@1,'<=',$1,$3) } |
	expression '>=' expression
		{ $$ = compiler.expression(@1,'>=',$1,$3) } |
	expression '>' expression
		{ $$ = compiler.expression(@1,'>',$1,$3) } |
	expression '<<' expression
		{ $$ = compiler.expression(@1,'<<',$1,$3) } |
	expression '>>' expression
		{ $$ = compiler.expression(@1,'>>',$1,$3) } |
	expression '>>>' expression
		{ $$ = compiler.expression(@1,'>>>',$1,$3) } |
	expression '+' expression
		{ $$ = compiler.expression(@1,'+',$1,$3) } |
	expression '-' expression
		{ $$ = compiler.expression(@1,'-',$1,$3) } |
	expression '--' expression
		{ $$ = compiler.expression(@1,'--',$1,$3) } |
	expression '*' expression
		{ $$ = compiler.expression(@1,'*',$1,$3) } |
	expression '/' expression
		{ $$ = compiler.expression(@1,'/',$1,$3) } |
	expression '%' expression
		{ $$ = compiler.expression(@1,'%',$1,$3) } |
	'!' expression
		{ $$ = compiler.expression(@1,'!',$2) } |
	'~' expression
		{ $$ = compiler.expression(@1,'~',$2) } |
	'-' expression %prec NEG
		{ $$ = compiler.expression(@1,'~~',$2) } |
	'--' expression %prec NEG
		{ $$ = compiler.expression(@1,'~~',$2) } |
	expression '?' expression ':' expression
		{ $$ = compiler.ifBlock(@2,$1,$3,$5) } |
	'{' safeexpr exprlist '}'
		{ $$ = compiler.callExpression(@1,$2,$3) } |
	'[' exprlist ']'
		{ $$ = compiler.array(@1,$2) } |
	VARNAME
		{ $$ = compiler.varname(@1,$1) } |
	INTEGER
		{ $$ = compiler.integer(@1,$1) } |
	FLOAT
		{ $$ = compiler.float($1) } |
	HEXNUMBER
		{ $$ = compiler.hex(@1,$1) } |
	BINNUMBER
		{ $$ = compiler.bin(@1,$1) } |
	ATOM
		{ $$ = compiler.atom($1) } |
	string
;

//------------------------------------------------------------

command:
	'{' safeexpr exprlist '}' exprlist
		{ $$ = compiler.call(@1,compiler.callExpression(@1,$2,$3),$5) } |
	VARNAME exprlist
		{ $$ = compiler.call(@1,$1,$2) } |
	CONTINUE
		{ $$ = compiler.continue(@1) } |
	YIELD expression
		{ $$ = compiler.yield(@1,$2) } |
	BREAK
		{ $$ = compiler.break(@1) } |
	RETURN
		{ $$ = compiler.return(@1) } |
	RETURN expression
		{ $$ = compiler.return(@1,$2) } |
	THROW
		{ $$ = compiler.throw(@1) } |
	THROW expression
		{ $$ = compiler.throw(@1,$2) } |
	LOCAL VARNAME
		{ $$ = compiler.local(@1,$2) } |
	LOCAL VARNAME '=' expression
		{ $$ = compiler.local(@1,$2,$4) } |
	SET VARNAME
		{ $$ = compiler.set(@1,$2,compiler.atom("true")) } |
	SET '(' safeexpr expression ')'
		{ $$ = compiler.memberSet(@1,$3,$4,compiler.atom("true")) } |
	SET VARNAME '=' expression
		{ $$ = compiler.set(@1,$2,$4) } |
	SET '(' safeexpr expression ')' '=' expression
		{ $$ = compiler.memberSet(@1,$3,$4,$7) } |
	UNSET VARNAME
		{ $$ = compiler.set(@1,$2,compiler.atom("undefined")) } |
	UNSET '(' safeexpr expression ')'
		{ $$ = compiler.memberSet(@1,$3,$4,compiler.atom("undefined")) }
;

string:
	STRING_START stringexpression STRING_END
		{ $$ = compiler.stringExpression(@1,$2) } |
	STRING_START STRING_END
		{ $$ = compiler.string('') } |
	STRING
		{ $$ = compiler.string($1) }
;

stringexpression:
	stringexpression stringvalue
		{ $$ = $1; $1.push($2) } |
	stringvalue
		{ $$ = [$1] }
;

stringvalue:
	VARNAME
		{ $$ = compiler.varname(@1,$1) } |
	STRING_DATA
		{ $$ = compiler.string($1) } |
	'$(' expression ')'
		{ $$ = $2 } |
	'$(' safeexpr expression ')'
		{ $$ = compiler.index(@1,$2,$3) } |
	'${' safeexpr exprlist '}'
		{ $$ = compiler.callExpression(@1,$2,$3) }
;

%%
require('./CompilerExtensions')
const compiler = new (require('./Compiler').Compiler)()
exports.compiler = compiler
parser._parse = parser.parse
parser.parse = function(input){
	compiler.reset()
	this.lexer.reset()
	this._parse(input.replace(/\r\n/g,'\n'))
}
