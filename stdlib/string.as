namespace string
	extern concat '__stringConcat'
	extern find '__stringFind'
	extern slice '__stringSlice'

	function split str:string glue:string
		local out = []
		local offset = 0
		while true
			local p = {string.find str glue offset}
			if p < 0
				return {array.push out {string.slice str offset}}
			array.push out {string.slice str offset p}
			set offset = p + 1

	function `from value:any
		if {istype value 'string'}
			return "\"$value\""
		if {istype value 'integer'}
			return {itos value}
		if {istype value 'float'}
			return {dtos value}
		if {istype value 'boolean'}
			return value?'true':'false'
		if {istype value 'undefined'}
			return 'undefined'
		if {istype value 'array'}
			return "[${array.join value}]"
		if {istype value 'hashmap'}
			return "<${hashmap.path value}:${typeof value}>"
		return "<:${typeof value}>"
