/*jshint freeze:true, latedef:true, nocomma:false, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, browser:true, esversion:6, loopfunc: true*/
"use strict";

var gulp = require('gulp');
var tap = require('gulp-tap');
var rename = require('gulp-rename');
var fs = require('fs');

gulp.task('parser', function(){
	return gulp.src(['parser.jison'])
		.pipe(rename('parser.js'))
		.pipe(tap(function(file){
			var grammar = require('ebnf-parser').parse(file.contents.toString());
			grammar.lex = require('lex-parser').parse(fs.readFileSync('lexer.jisonlex').toString());
			var settings = {
				type: 'slr',
				moduleName: 'parser',
				debug: false,
				moduleType: 'commonjs'
			};
			file.contents = Buffer((new require('jison').Generator(grammar,settings)).generate(settings));
		}))
		.pipe(gulp.dest('.'));
});
