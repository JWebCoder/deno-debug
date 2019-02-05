# Deno Debug [![Build Status](https://travis-ci.org/rista404/deno-debug.svg?branch=master)](https://travis-ci.org/rista404/deno-debug)

<img width="647" src="demo.png">

Debug utility for deno. Under development.

## Usage

```javascript
import debug from 'https://raw.githubusercontent.com/rista404/deno-debug/master/debug.ts'

// create debugger
const service = debug('service')

const serviceName = 'app'

// log
service('booting %s', serviceName)
```

Then run your app.
```sh
> DEBUG=* deno --allow-env app.ts
```


## Todo

- [x] extending debuggers
- [x] custom log functions
- [x] custom formatters
- [x] `log` override in all namespaces
- [x] inspect opts
- [ ] detecting color support
- [ ] non-tty env
- [ ] add `debug` to registry 

## Notes

- Currently debug assumes it is TTY and shows colors by default.
- Deno's `inspect` differs from node's `util.inspect` so the output may not be the same.
- We're using a custom `format` function ported from `util`. Might be cool to extract it when `util` is ported entirely.
- We should cover more functionality with tests.
