function fibo n:integer
	if n < 2
		return "1"
	local t1 = {async fibo n-1}
	local t2 = {async fibo n-2}
	return "${await t1}+${await t2}"

while true
	print {length {string.split {fibo 20} "+"}}

#=
local a = [1 2 3 4 5 6 7 8 9 0]
array.unshift a -4 -3 -2 -1
print {array.expand a [8 8] [1 1]}
print {array.find a 8}
print {array.find a 8 12}
print {array.find a "kupa"}
print {array.shift a}
print a
array.resize a 10
print {array.reverse a}
print {string.split "a+b+c+d+e+f+g+h" "+"}
local p = {string.find "mmamamammaremarekkkkkk" "marek"}
print p {string.slice "mmamamammaremarekkkkkk" p p+5}
=#