import {Compiler} from './Compiler'
declare namespace JisonParser {
	function parse(data:string) : void
	const compiler:Compiler
}
export = JisonParser