		# Formula1-Theme for Hugo

## Installation

    $ mkdir themes
    $ git submodule add https://github.com/protogia/formula1-theme.git themes/formula1

See [the Hugo documentation](http://gohugo.io/themes/installing/) for more information.

## Supported shortcodes

- expandable sections
- interactive plotly-charts

## Enable Highlighting

Add the following to your hugo.toml:

```
[markup]
  [markup.highlight]
    noClasses = false
    guessSyntax = true
    codeFences = true
```

## License

MIT Licensed, see [LICENSE](https://github.com/protogia/formula1-theme/blob/master/LICENSE).
