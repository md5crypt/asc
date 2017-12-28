extern typeof '__typeof'
extern nameof '__nameof'
extern length '__length'
extern stdout '__print'
extern itos '__itos'
extern dtos '__dtos'

function print ...
	for i in 0:{_argc}-1
		stdout {string.from {_argv i}}+' '
	stdout {string.from {_argv {_argc}-1}}+'\n'