%options flex
%x indent
%x string
%x comment
%x jsbody
%x jscomment

ID [_A-Za-z][\w]*

%%

<indent>[#\n]
	{ this.unput(yytext[0]); this.popState() }

<indent>[ \t]
	{ this.indent.cnt++ }

<indent><<EOF>> {
	if(this.indent.current > 0){
		this.unput(' ')
		if(this.indent.nl == 0){
			this.indent.nl = 1
			return 'NL'
		}
		this.indent.current -= this.indent.size
		return 'DEDT'
	}else{
		this.popState()
		this.indent.size = 0
		this.indent.cnt = 0
		this.indent.current = 0
		if(this.indent.nl == 0)
			return 'NL'
		this.indent.nl = 0
	}
}

<indent>. {
	if(this.indent.cnt != 0 && this.indent.size == 0){
		this.indent.size = this.indent.cnt
	}
	if(this.indent.cnt == this.indent.current){
		this.unput(yytext[0])
		this.popState()
		if(this.indent.nl == 1){
			this.indent.nl = 0
		}else{
			return 'NL'
		}
	}else if(this.indent.cnt == this.indent.current+this.indent.size){
		this.indent.current = this.indent.cnt
		this.unput(yytext[0])
		this.popState()
		return 'INDT'
	}else if(this.indent.cnt < this.indent.current && this.indent.cnt%this.indent.size == 0){
		this.unput(yytext[0])
		if(this.indent.nl == 0){
			this.indent.nl = 1
			return 'NL'
		}
		this.indent.current -= this.indent.size;
		return 'DEDT'
	}else{
		this.unput(yytext[0]);
		this.popState();
		return this.indent.ERROR
	}
}

<string>\$[`.]?{ID}(?:[.]{ID})*
	{ yytext = yytext.slice(1); return 'VARNAME' }

<string>\$[({]
	{ this.pushState('INITIAL'); this.sbstack.push(this.braces); this.braces=1; return yytext; }

<string>(?:\\[nrt\\"\$]|[^\$"])+ {
	yytext = yytext.replace(/\\([nrt\\"\$])/g,(m,g)=>{
		switch(g){
			case 'n': return '\n'
 			case 'r': return '\r'
 			case 't': return '\t'
		}
		return g
	})
	return 'STRING_DATA'
}
<string>'"'
	{ this.popState(); return 'STRING_END' }

// ------------------------------------------------------------------------------------------------

<comment>'=#'
	{ if(--this.comment==0) this.popState() }

<comment>'#='
	{ this.comment++ }

<comment>[^=#]+
	/* eat comments */

<comment>.
	/* eat comments */

// ------------------------------------------------------------------------------------------------

[ \f\t\v]\-(?![ \f\t\v])
	{ return '--' }

[ \f\r\t\v]+
	/* eat whitespace */

'#='
	{ this.comment = 1; this.begin('comment') }

\#(?!\=)(?:[^\n]*\\\n)*[^\n]*
	/* eat comments */

\n {
	if(this.braces==0){
		this.begin('indent')
		this.indent.cnt = 0
	}
}

<<EOF>>
	{ this.begin('indent'); this.unput(' ') }

['](?:\\.|[^\\'])*['] {
	yytext = yytext.slice(1,-1).replace(/\\([nrt\\'\$])/g,(m,g)=>{
		switch(g){
			case 'n': return '\n'
 			case 'r': return '\r'
 			case 't': return '\t'
		}
		return g
	})
	return 'STRING';
}

'"'
	{ this.begin('string'); return 'STRING_START' }

'||'|'&&'|'==='|'=='|'!=='|'!='|'<='|'>='|'>>>'|'>>'|'<<'|'='|'...'|':'
	{ return yytext }

and
	{ return '&&' }

or
	{ return '||' }

not
	{ return '!' }

[?|&!><=+%~/*^:\@-]
	{ return yytext }

[\[({]
	{ this.braces++; return yytext }

[)}\]] {
	this.braces -= 1
	if(this.braces == 0 && this.stateStackSize()>1){
		this.popState()
		this.braces = this.sbstack.pop()
	}
	return yytext
}

on|if|in|for|elseif|else|while|function|local|scope|set|unset|return|break|continue|throw|namespace|extern|yield|import|from|object|location|item|character
	{ return yytext.toUpperCase() }

true|false|undefined
	{ return 'ATOM' }

[`.]?{ID}(?:[.]{ID})* {
	if(yytext[0]=='`')
		yytext=yytext.slice(1)
 	return 'VARNAME'
}

[0-9]*\.[0-9]+(?:[eE][-+]?[0-9]+)?
	{ return 'FLOAT' }

[0-9]+(?:[eE][-+]?[0-9]+)??
	{ return 'INTEGER' }

0[Xx][0-9a-fA-F]+
	{ return 'HEXNUMBER' }

0[bB][01]+
	{ return 'BINNUMBER' }

.
	{ return 'INVALID_TOKEN' }

%%
lexer.reset = function(){
	this.sbstack = []
	this.braces = 0
	this.indent = {
		cnt:0,
		size:0,
		current:0,
		nl:0
	}
}
