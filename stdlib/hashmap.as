namespace hashmap
	extern keys '__hashmapKeys'
	extern values '__hashmapValues'
	function path node:hashmap
		local path = {nameof node}
		while node.parent
			set node = node.parent
			set path = {nameof node}+'.'+path
		return path
