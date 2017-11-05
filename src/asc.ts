import 'source-map-support/register'
import program = require('commander')
import glob = require('glob')
import fs = require('fs-extra')
import path = require('path')
import parser = require('./parser.js')
import {Linker,CompiledFile} from './Linker'
import * as objectDump from './ObjectDump'
program
	.version('0.2.0')
	.description('adventurescript compiler and linker')
	.usage('[options]')
	.option('-d, --directory <directory>', 'set the root directory')
	.option('-p, --purge', 'purge cache')
	.option('-c, --compile', 'compile')
	.option('-l, --link', 'link')
	.option('-D, --dump [file]', 'dump compiled image')
	.option('-O, --dump-object <object>', 'dump compiled object')
	.option('-F, --dump-file <file>', 'compile and dump file')
	.parse(process.argv)

if(Object.values(program.opts()).filter(x=>typeof x != 'undefined').length == 1)
	program.help()
console.log()

let cwd = '.'
if(program.directory){
	cwd = program.directory.replace(/\\/g,'/').replace(/[\/]+$/,'')
	if(!fs.existsSync(cwd)){
		console.error("Error: the specifed directory does no exist")
		process.exit(1)
	}
	console.log(`using directory '${path.resolve(cwd)}'`)
}

const objectpath = cwd+'/__output/object/'

if(program.rebuild){
	console.log('purging output cache\n')
	fs.emptyDirSync(objectpath)
}

if(program.compile){
	compile(cwd)
	console.log()
}

if(program.link){
	link(cwd)
	console.log()
}

if(program.dumpFile){
	let file:string = program.dumpFile
	if(!fs.existsSync(file)){
		if(fs.existsSync(`${cwd}/${file}`)){
			file = `${cwd}/${file}`
		}else{
			console.error("Error: the specifed file was not found")
			process.exit(1)
		}
	}
	parser.parse(fs.readFileSync(file,'utf8'))
	const objectFile = new objectDump.ObjectFile(
		parser.compiler.getCode(),
		parser.compiler.getObjects(),
		parser.compiler.getStrings()
	)
	objectFile.print()
	process.exit(0)
}

if(program.dumpObject){
	let file:string = program.dumpObject
	if(file.slice(-2)!='.o')
		file = file+'.o'
	if(!fs.existsSync(file)){
		if(fs.existsSync(`${cwd}/${file}`)){
			file = `${cwd}/${file}`
		}else if(fs.existsSync(`${objectpath}/${file}`)){
			file = `${objectpath}/${file}`
		}else{
			console.error("Error: the specifed file was not found")
			process.exit(1)
		}
	}
	const code = fs.readFileSync(file)
	const meta:CompiledFile = JSON.parse(fs.readFileSync(file.slice(0,-1)+'json','utf8'))
	const objectFile = new objectDump.ObjectFile(
		new Uint32Array(code.buffer,code.byteOffset,code.byteLength>>2),
		meta.objects,
		meta.strings
	)
	objectFile.print()
	process.exit(0)
}

if(program.dump){
	let file = (typeof program.dump == 'string')?program.dump:`${cwd}/__output/image.bin`
	if(!fs.existsSync(file)){
		if(fs.existsSync(`${cwd}/${file}`)){
			file = `${cwd}/${file}`
		}else if(fs.existsSync(`${cwd}/__output/${file}`)){
			file = `${cwd}/__output/${file}`
		}else{
			console.error("Error: the specifed file was not found")
			process.exit(1)
		}
	}
	const imageFile = new objectDump.ImageFile(fs.readFileSync(file))
	imageFile.print()
	process.exit(0)
}

function compile(cwd:string){
	if(!fs.existsSync(objectpath)){
		console.log(`creating directory '${objectpath}'`)
		fs.ensureDirSync(objectpath)
	}
	const files = glob.sync('**/*.as',{cwd:cwd})
	let modified = 0
	let errors = 0
	for(const file of files){
		try{
			const root = file.replace(/\.as$/,'').replace(/\//g,'.')
			const asfile = `${cwd}/${file}`
			const ofile = `${cwd}/__output/object/${root}.o`
			const jsonfile = `${cwd}/__output/object/${root}.json`
			if(!fs.existsSync(asfile))
				throw new Error(`file ${asfile} not found`)
			if(fs.existsSync(ofile) && fs.statSync(ofile).mtime.getTime() > fs.statSync(asfile).mtime.getTime())
				continue
			process.stdout.write(`compiling '${file}'...`.padEnd(48))
			const data = fs.readFileSync(asfile,'utf8')
			parser.parse(data)
			fs.writeFileSync(ofile,new Uint8Array(parser.compiler.getCode().buffer))
			fs.writeFileSync(jsonfile,JSON.stringify({
				objects:parser.compiler.getObjects(),
				strings:parser.compiler.getStrings(),
			}))
			process.stdout.write('[ok]\n')
			modified += 1
		}catch(e){
			errors += 1
			process.stdout.write('[failed]\n')
			console.log(e.stack)
		}
	}
	console.log(`${modified} modified ${errors} failed ${files.length-modified-errors} unchanged`)
}

function link(cwd:string){
	const files:CompiledFile[] = glob.sync("*.json",{cwd:cwd+'/__output/object'}).map(file=>{
		const data:CompiledFile = JSON.parse(fs.readFileSync(cwd+'/__output/object/'+file,'utf8'))
		const code = fs.readFileSync(cwd+'/__output/object/'+file.replace(/\.json$/,'.o'))
		data.base = file.replace(/\.?[^.]+\.json$/,'')
		data.code = new Uint32Array(code.buffer,code.byteOffset,code.length>>2)
		data.path = file
		return data
	})
	const linker = new Linker(files)
	for(const file of files){
		process.stdout.write(`linking '${file.path}'...`.padEnd(48))
		linker.link(file)
		process.stdout.write('[ok]\n')
	}
	const imageFile = `${cwd}/__output/image.bin`
	console.log(`writing binary image to '${imageFile}'`)
	fs.writeFileSync(imageFile,linker.buildImage())
}
