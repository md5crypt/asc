PATH := node_modules/.bin:$(PATH)

all: pre-build build

watch:
	tsc --watch

clean:
	rm -f src/vmConstants.ts
	rm -rf build

pre-build: src/vmConstants.ts

build: build/asc.js build/parser.js

src/vmConstants.ts: vm_op.json vm_type.json scripts/codegen.js
	@mkdir -p build
	node scripts/codegen

build/parser.js: src/parser.jison src/parser.jisonlex
	jison src/parser.jison src/parser.jisonlex -o $@

build/asc.js: $(wildcard src/*.ts) src/vmConstants.ts
	tsc
