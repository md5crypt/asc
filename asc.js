/*jshint freeze:true, latedef:true, nocomma:true, nonbsp:true, nonew:true, strict:true, undef:true, unused:true, node:true, esversion:6*/
"use strict";

var program = require('commander');
var glob = require('glob');
var os = require('os');
var fs = require('fs-extra');

program
  .version('0.2.0')
  .description('adventurescript compiler')
  .usage('[options]')
  .option('-f, --file [file]', 'process a specyfic file')
  .option('-d, --directory [directory]', 'set the root directory','.')
  .option('-r, --rebuild', 'rebuild everything')
  .option('-p, --processes <n>', 'set the number of processes',os.cpus().length)
  .parse(process.argv);

var cwd = program.directory;
console.log("--- [adventurescript compiler v"+program.version()+"] ---");
if(!fs.existsSync(cwd)){
	console.error("\nError: the specifed directory does no exist");
	return 1;
}
console.log(`using directory ${require('path').resolve(cwd)}`);
cwd = cwd.replace(/\\/g,'/').replace(/[\/]+$/,'');

var objectpath = cwd+'/__output/object/';

if(!fs.existsSync(objectpath)){
	console.log("creating subdirectory __output/object");
	fs.ensureDirSync(objectpath);
}

if(program.rebuild){
	console.log("purging output cache");
	fs.emptydirSync(objectpath);
}

var files;
if(program.file){
	files = [program.file.replace(/\\/g,'/').replace(/^[\/]+|[\/]+$/g,'')];
}else{
	files = glob.sync("**/*.as",{cwd:cwd});
}

console.log(`spawning ${Math.min(files.length,program.processes)} processes\n`);
var pool = new (require('threads').Pool)(Math.min(files.length,program.processes));
pool.run(function(input,done){
	var fs = require("fs");
	var parser = require(input.__dirname+"/parser.js").parser;
	var base = input.base;
	var file = input.file;
	var root = file.replace(/\.as$/,'').replace(/\//g,'.');
	var asfile = base+'/'+file;
	var ofile = `${base}/__output/object/${root}.o`;
	var jsonfile = `${base}/__output/object/${root}.json`;
	if(!fs.existsSync(asfile))
		throw new Error(`File ${asfile} not found`);
	if(fs.existsSync(ofile) && fs.statSync(ofile).mtime.getTime() > fs.statSync(asfile).mtime.getTime())
		return done(false);
	console.log(`processing ${file}... `);
	var data = String(fs.readFileSync(asfile));
	parser.parse(data);
	fs.writeFileSync(ofile,Buffer(parser.code.buffer));
	fs.writeFileSync(jsonfile,JSON.stringify({
		objects:parser.objects,
		strings:Array.from(parser.strings.keys()),
	}));
	return done(true);
});

files.forEach(o=>pool.send({base:cwd,file:o,__dirname:__dirname}));

var modified = 0;
var errors = 0;

pool
	.on('done', function(job, message){
		modified += message|0;
	})
	.on('error', function(job, error){
		errors += 1;
		console.error(`Error (${job.sendArgs[0].file}):  ${error.message}`);
	})
	.on('finished', function(){
		pool.killAll();
		console.log(`\nprocessed ${files.length} files; ${modified} modified; ${errors} failed; ${files.length-modified-errors} unchanged`);
		if(errors > 0){
			console.error(`build failed`);
			return 1;
		}
		console.log(`build successful`);
	});
