namespace array
	extern create '__array_create'
	extern static '__array_static'
	extern push '__array_push'
	extern pop '__array_pop'
	extern shift '__array_shift'
	extern unshift '__array_unshift'
	extern resize '__array_resize'
	extern slice '__array_slice'
	extern write '__array_write'
	extern fill '__array_fill'
	extern find '__array_find'
	extern expand '__array_expand'
	extern reverse '__array_reverse'
	
	function join A:array glue?:string
		local n = {length A}
		if n == 0
			return ''
		set glue = glue || ' '
		local str = {string.from (A 0)}
		for i in 1:n
			set str = "$str$glue${string.from (A i)}"
		return str