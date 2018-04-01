namespace array
	extern create '__arrayCreate'
	extern static '__arrayStatic'
	extern push '__arrayPush'
	extern pop '__arrayPop'
	extern shift '__arrayShift'
	extern unshift '__arrayUnshift'
	extern resize '__arrayResize'
	extern slice '__arraySlice'
	extern write '__arrayWrite'
	extern fill '__arrayFill'
	extern find '__arrayFind'
	extern expand '__arrayExpand'
	extern reverse '__arrayReverse'
	
	function join A:array glue?:string
		local n = {length A}
		if n == 0
			return ''
		set glue = glue || ' '
		local str = {string.from (A 0)}
		for i in 1:n
			set str = "$str$glue${string.from (A i)}"
		return str