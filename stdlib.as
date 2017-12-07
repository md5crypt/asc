namespace stdlib
	function path node:object
		local path = {nameof node}
		while node.parent
			set node = node.parent
			set path = {nameof node}+'.'+path
		return path

	function join A:array glue?:string
		local n = {length A}
		if n == 0
			return ''
		set glue = glue || ' '
		local str = {string (A 0)}
		for i in 1:n
			set str = "$str$glue${string (A i)}"
		return str

	function string value:any
		if {istype value 'string'}
			return "\"$value\""
		if {istype value 'integer'}
			return {externs.itos value}
		if {istype value 'float'}
			return {externs.dtos value}
		if {istype value 'boolean'}
			return value?'true':'false'
		if {istype value 'undefined'}
			return 'undefined'
		if {istype value 'array'}
			return "[${join value}]"
		if {istype value 'object'}
			return "[${path value}:${typeof value}]"
		return "[:${typeof value}]"

	function print ...
		for i in 0:{_argc}-1
			externs.print {string {_argv i}}+' '
		externs.print {string {_argv {_argc}-1}}+'\n'

import join string print from stdlib
