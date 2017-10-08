%options flex
%x indent
%x string
%x comment
%x jsbody
%x jscomment

ID [_A-Za-z][\w]*

%%

<indent>[#\n]	{ this.unput(yytext[0]); this.popState(); }
<indent>[ \t]	{ this.indent.cnt++; }
<indent><<EOF>> {
	if(this.indent.current > 0){
		this.unput(' ');
		if(this.indent.nl == 0){
			this.indent.nl = 1;
			return 'NL';
		}
		this.indent.current -= this.indent.size;
		return 'DEDT';
	}else{
		this.popState();
		this.indent.size = 0;
		this.indent.cnt = 0;
		this.indent.current = 0;
		if(this.indent.nl == 0)
			return 'NL';
		this.indent.nl = 0;
	}
}
<indent>. {
	if(this.indent.cnt != 0 && this.indent.size == 0){
		this.indent.size = this.indent.cnt;
	}
	if(this.indent.cnt == this.indent.current){
		this.unput(yytext[0]);
		this.popState();
		if(this.indent.nl == 1){
			this.indent.nl = 0;
		}else{
			return 'NL';
		}
	}else if(this.indent.cnt == this.indent.current+this.indent.size){
		this.indent.current = this.indent.cnt;
		this.unput(yytext[0]);
		this.popState();
		return 'INDT';
	}else if(this.indent.cnt < this.indent.current && this.indent.cnt%this.indent.size == 0){
		this.unput(yytext[0]);
		if(this.indent.nl == 0){
			this.indent.nl = 1;
			return 'NL';
		}
		this.indent.current -= this.indent.size;
		return 'DEDT';
	}else{
		this.unput(yytext[0]);
		this.popState();
		return this.indent.ERROR;
	}
}

<string>[\s]+							{ return 'WS'; }
<string>\$(?:[1-9][0-9]*|0)				{ yytext=yytext.slice(1); return 'NUMBER'; }
<string>\$[`.]?{ID}(?:[.]{ID})*			{ yytext=yytext.slice(1); return 'VARNAME'; }
<string>\$[({] 							{ this.pushState('INITIAL'); this.sbstack.push(this.braces); this.braces=1; return yytext; }
<string>\\{ID}							{ yytext=yytext.slice(1); return 'STRING_CMD'; }
<string>(?:\\[^A-Za-z_]|[^\$~{}\\"\s])+	{ yytext=yytext.replace(/\\([\x20\\"${}~])/g,'$1'); return 'STRING_WORD'; }
<string>[{}]							{ return yytext; }
<string>[~]+							{ return 'STRING_NBSP'; }
<string>'"'								{ this.popState(); return 'STRING_END'; }

<comment>'=#'	{ if(--this.comment==0) this.popState(); }
<comment>'#='	{ this.comment++; }
<comment>[^=#]+	/* eat comments */
<comment>.		/* eat comments */

<jsbody>'}'	{
	if(--this.jsbodycnt==0){
		this.popState();
		yytext = this.jsbody;
		this.jsbody = null;
		return 'JSBODY';
	}
	this.jsbody += yytext;
}
<jsbody>'{'	{ this.jsbodycnt++; this.jsbody += yytext; }
<jsbody>'/*' { this.jscomment = 1; this.begin('jscomment'); }
<jsbody>\/\/(?:[^\n]*\\\n)*[^\n]* 	/* eat */
<jsbody>["](?:\\.|[^\\"])*["] 			{ this.jsbody += yytext; }
<jsbody>['](?:\\.|[^\\'])*[']			{ this.jsbody += yytext; }
<jsbody>[ \f\r\t\v\n]+					{ this.jsbody += ' '; }
<jsbody>[^'"/{} \f\r\t\v\n]+			{ this.jsbody += yytext; }
<jsbody>.								{ this.jsbody += yytext; }

<jscomment>'*/'	{ if(--this.jscomment==0) this.popState(); }
<jscomment>'/*'	{ this.jscomment++; }
<jscomment>[^/*]+	/* eat */
<jscomment>.		/* eat */

[ \f\t\v]\-(?![ \f\t\v]) { return '--'; }
[ \f\r\t\v]+			/* eat whitespace */
'#='					{ this.comment = 1; this.begin('comment'); }
\#(?!\=)(?:[^\n]*\\\n)*[^\n]* { yy.parser.comment(yytext); }
\n						{ if(this.braces==0) {this.begin('indent'); this.indent.cnt = 0;} }
<<EOF>>					{ this.begin('indent'); this.unput(' '); }
'"'						{ this.begin('string'); return 'STRING_START'; }
['](?:\\.|[^\\'])*[']	{ yytext=yytext.slice(1,-1).replace(/\\(['\\])/g,'$1'); return 'STRING'; }
'||'|'&&'|'==='|'=='|'!=='|'!='|'<='|'>='|'>>'|'<<'|'=' { return yytext; }
and						{ return '&&'; }
or						{ return '||'; }
not						{ return '!'; }
[?|&!><=+%~/*^:\-]	{ return yytext; }
[\[(]					{ this.braces++; return yytext; }
[)}\]]					{
	this.braces--;
	if(this.braces == 0 && this.stateStackSize()>1){
		this.popState();
		this.braces = this.sbstack.pop();
	}
	return yytext;
}
native					{ this.jsbodycnt = 1; this.jsbody = ''; return yytext.toUpperCase(); }
'{'						{ if(this.jsbodycnt > 0){ this.begin('jsbody'); } else { this.braces++; return yytext; } }
if|elseif|else|while|function|local|set|unset|return|break|continue|pattern|throw|namespace|dispatcher|extends|extend|yield|on|dialog|option|combine|location|object { return yytext.toUpperCase(); }
\:\:[a-z]+				{ return 'TYPE'; }
true|false|undefined	{ return 'ATOM'; }
[`.]?{ID}(?:[.]{ID})*	{ if(yytext[0]=='`') yytext=yytext.slice(1); return 'VARNAME'; }
[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?	{ return 'NUMBER'; }
0[Xx][0-9a-fA-F]+		{ return 'HEXNUMBER'; }
0[bB][01]+				{ return 'BINNUMBER'; }
.						{ return 'INVALID_TOKEN'; }

%%
lexer.reset = function(){
	this.sbstack = [];
	this.braces = 0;
	this.jsbodycnt = 0;
	this.indent = {
		cnt:0,
		size:0,
		current:0,
		nl:0
	};
};
