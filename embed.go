package opshub

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:web/dist
var WebDistFS embed.FS

// StaticFS returns an http.FileSystem serving the embedded web/dist directory.
func StaticFS() (http.FileSystem, error) {
	sub, err := fs.Sub(WebDistFS, "web/dist")
	if err != nil {
		return nil, err
	}
	return http.FS(sub), nil
}
