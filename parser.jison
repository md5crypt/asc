/*! AdventureScript Parser v0.2.0 | MIT License | (c) 2017 Marek Korzeniowski */

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
%right '?' ':'
%%

//------------------------------------------------------------

file: program | NL program ;

program:
	statments
		{ yy.parser.func(@1,'@main',[],yy.parser.wrapblock($1)); }
;

//------------------------------------------------------------


object:
	FUNCTION VARNAME arguments fblock
		{ $$ = yy.parser.func(@1,$2,$3,$4); } |
	NAMESPACE VARNAME nullblock
		{ $$ = yy.parser.namespace(@1,$2,$3); }
;

argument:
	VARNAME |
	VARNAME TYPE
		{ $$ = $1+$2; }
;

arguments:
	arguments argument
		{ $$ = $1; $$.push($2); } |
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
		{ $$ = yy.parser.wrapblock($1); } |
	NL
		{ $$ = yy.parser.wrapblock([]); }
;

block:
	INDT statments DEDT
		{ $$ = yy.parser.wrapblock($2); }
;

fblock:
	INDT fstatments DEDT
		{ $$ = yy.parser.wrapblock($2); }
;

nullblock: block | NL { $$ = yy.parser.wrapblock([]); } ;

statments:
	statments object
		{ $$ = $1; $$.push.apply($$,$2); /*a*/ } |
	statments command NL
		{ $$ = $1; $$.push.apply($$,$2); /*c*/} |
	statments IF ifexpression
		{ $$ = $1; $$.push.apply($$,$3); /*d*/} |
	statments WHILE whileexpression
		{ $$ = $1; $$.push.apply($$,$3); /*e*/} |
	/* empty */
		{ $$ = []; }
;

fstatments:
	fstatments command NL
		{ $$ = $1; $$.push.apply($$,$2); /*c*/} |
	fstatments IF ifexpression
		{ $$ = $1; $$.push.apply($$,$3); /*d*/} |
	fstatments WHILE whileexpression
		{ $$ = $1; $$.push.apply($$,$3); /*e*/} |
	/* empty */
		{ $$ = []; }
;


//------------------------------------------------------------

ifexpression:
	expression body %prec THEN
		{ $$ = yy.parser.ifblock(@1,$1,$2,null); } |
	expression body ELSE body
		{ $$ = yy.parser.ifblock(@1,$1,$2,$4); } |
	expression command ELSE body
		{ $$ = yy.parser.ifblock(@1,$1,yy.parser.wrapblock($2),$4); } |
	expression body ELSEIF ifexpression
		{ $$ = yy.parser.ifblock(@1,$1,$2,$4); } |
	expression command ELSEIF ifexpression
		{ $$ = yy.parser.ifblock(@1,$1,yy.parser.wrapblock($2),$4); }
;

//------------------------------------------------------------

whileexpression:
	expression body
		{ $$ = yy.parser.whileblock(@2,$1,$2); }
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
		{ $$ = yy.parser.index(@1,$1,$2); } |
	expression '||' expression
		{ $$ = yy.parser.expr(@1,$1,'||',$3); } |
	expression '&&' expression
		{ $$ = yy.parser.expr(@1,$1,'&&',$3); } |
	expression '|' expression
		{ $$ = yy.parser.expr(@1,$1,'|',$3); } |
	expression '^' expression
		{ $$ = yy.parser.expr(@1,$1,'^',$3); } |
	expression '&' expression
		{ $$ = yy.parser.expr(@1,$1,'&',$3); } |
	expression '==' expression
		{ $$ = yy.parser.expr(@1,$1,'==',$3); } |
	expression '===' expression
		{ $$ = yy.parser.expr(@1,$1,'===',$3); } |
	expression '!=' expression
		{ $$ = yy.parser.expr(@1,$1,'!=',$3); } |
	expression '!==' expression
		{ $$ = yy.parser.expr(@1,$1,'!==',$3); } |
	expression '<' expression
		{ $$ = yy.parser.expr(@1,$1,'<',$3); } |
	expression '<=' expression
		{ $$ = yy.parser.expr(@1,$1,'<=',$3); } |
	expression '>=' expression
		{ $$ = yy.parser.expr(@1,$1,'>=',$3); } |
	expression '>' expression
		{ $$ = yy.parser.expr(@1,$1,'>',$3); } |
	expression '<<' expression
		{ $$ = yy.parser.expr(@1,$1,'<<',$3); } |
	expression '>>' expression
		{ $$ = yy.parser.expr(@1,$1,'>>',$3); } |
	expression '+' expression
		{ $$ = yy.parser.expr(@1,$1,'+',$3); } |
	expression '-' expression
		{ $$ = yy.parser.expr(@1,$1,'-',$3); } |
	expression '--' expression
		{ $$ = yy.parser.expr(@1,$1,'--',$3); } |
	expression '*' expression
		{ $$ = yy.parser.expr(@1,$1,'*',$3); } |
	expression '/' expression
		{ $$ = yy.parser.expr(@1,$1,'/',$3); } |
	expression '%' expression
		{ $$ = yy.parser.expr(@1,$1,'%',$3); } |
	'!' expression
		{ $$ = yy.parser.expr(@1,null,'!',$2); } |
	'~' expression
		{ $$ = yy.parser.expr(@1,null,'~',$2); } |
	'-' expression %prec NEG
		{ $$ = yy.parser.expr(@1,null,'~~',$2); } |
	'--' expression %prec NEG
		{ $$ = yy.parser.expr(@1,null,'~~',$2); } |
	expression '?' expression ':' expression
		{ $$ = yy.parser.ifblock(@2,$1,$3,$5); } |
	'{' safeexpr exprlist '}'
		{ $3.unshift($2); $$ = yy.parser.exprcall(@1,$3); } |
	'[' exprlist ']'
		{ $$ = yy.parser.array(@1,$2); } |
	VARNAME
		{ $$ = yy.parser.varname(@1,$1); } |
	NUMBER
		{ $$ = yy.parser.number(@1,$1); } |
	HEXNUMBER
		{ $$ = yy.parser.hex(@1,$1); } |
	BINNUMBER
		{ $$ = yy.parser.bin(@1,$1); } |
	ATOM
		{ $$ = yy.parser.atom($1); } |
	STRING
		{ $$ = yy.parser.string($1); }
;

//------------------------------------------------------------

command:
	'{' safeexpr exprlist '}' exprlist
		{ $3.unshift($2); $$ = yy.parser.c_call(@1,yy.parser.exprcall(@1,$3),$5); } |
	VARNAME exprlist
		{ $$ = yy.parser.c_call(@1,$1,$2); } |
	CONTINUE
		{ $$ = yy.parser.c_con(@1); } |
	YIELD expression
		{ $$ = yy.parser.c_yie(@1,$2); } |
	BREAK
		{ $$ = yy.parser.c_bre(@1); } |
	RETURN
		{ $$ = yy.parser.c_ret(@1); } |
	RETURN expression
		{ $$ = yy.parser.c_ret(@1,$2); } |
	THROW
		{ $$ = yy.parser.c_thr(@1,[null]); } |
	THROW expression
		{ $$ = yy.parser.c_thr(@1,$2); } |
	LOCAL VARNAME
		{ $$ = yy.parser.c_local(@1,$2,null); } |
	LOCAL VARNAME '=' expression
		{ $$ = yy.parser.c_local(@1,$2,$4); } |
	SET VARNAME
		{ $$ = yy.parser.c_set(@1,$2,[true]); } |
	SET '(' safeexpr expression ')'
		{ $$ = yy.parser.c_mset(@1,$3,$4,[true]); } |
	SET VARNAME '=' expression
		{ $$ = yy.parser.c_set(@1,$2,$4); } |
	SET '(' safeexpr expression ')' '=' expression
		{ $$ = yy.parser.c_mset(@1,$3,$4,$7); } |
	UNSET VARNAME
		{ $$ = yy.parser.c_set(@1,$2,[null]); } |
	UNSET '(' safeexpr expression ')'
		{ $$ = yy.parser.c_mset(@1,$3,$4,[null]); }
;

%%
require('./parser.proto.js')(parser);
