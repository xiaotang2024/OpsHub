package template

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"opshub/internal/model"
)

// reservedVars contains the list of system placeholders protected against being overwritten by custom environment variables.
var reservedVars = map[string]bool{
	"SERVICE_NAME": true,
	"INSTALL_DIR":  true,
	"PACKAGE_FILE": true,
	"JAVA_BIN":     true,
	"PORT":         true,
	"JVM_OPTS":     true,
}

// JVMConfig represents the structured configuration for Java Virtual Machine parameters.
type JVMConfig struct {
	HeapMin  string `json:"heap_min,omitempty"`
	HeapMax  string `json:"heap_max,omitempty"`
	GC       string `json:"gc,omitempty"`
	OOMDump  *bool  `json:"oom_dump,omitempty"`
	DumpPath string `json:"dump_path,omitempty"`
	Custom   string `json:"custom,omitempty"`
}

// ToFlags converts the JVMConfig into a formatted CLI arguments string.
func (cfg *JVMConfig) ToFlags() string {
	if cfg == nil {
		return ""
	}
	var parts []string

	// Heap min (-Xms)
	if min := strings.TrimSpace(cfg.HeapMin); min != "" {
		if strings.HasPrefix(min, "-Xms") {
			parts = append(parts, min)
		} else {
			parts = append(parts, "-Xms"+min)
		}
	}

	// Heap max (-Xmx)
	if max := strings.TrimSpace(cfg.HeapMax); max != "" {
		if strings.HasPrefix(max, "-Xmx") {
			parts = append(parts, max)
		} else {
			parts = append(parts, "-Xmx"+max)
		}
	}

	// GC option
	if gc := strings.TrimSpace(cfg.GC); gc != "" {
		switch strings.ToUpper(gc) {
		case "G1":
			parts = append(parts, "-XX:+UseG1GC")
		case "ZGC":
			parts = append(parts, "-XX:+UseZGC")
		case "PARALLEL":
			parts = append(parts, "-XX:+UseParallelGC")
		case "CMS":
			parts = append(parts, "-XX:+UseConcMarkSweepGC")
		default:
			parts = append(parts, gc)
		}
	}

	// OOM Dump options
	if cfg.OOMDump != nil && *cfg.OOMDump {
		parts = append(parts, "-XX:+HeapDumpOnOutOfMemoryError")
		if dumpPath := strings.TrimSpace(cfg.DumpPath); dumpPath != "" {
			parts = append(parts, "-XX:HeapDumpPath="+dumpPath)
		}
	}

	// Custom options
	if custom := strings.TrimSpace(cfg.Custom); custom != "" {
		parts = append(parts, custom)
	}

	return strings.Join(parts, " ")
}

// Engine compiles deployment templates and expands variables for services.
type Engine struct{}

// NewEngine creates a new template Engine instance.
func NewEngine() *Engine {
	return &Engine{}
}

// ParseJVMOptions converts a JVM options JSON string (or raw options string) into a CLI flags string.
func (e *Engine) ParseJVMOptions(rawJSON string) string {
	rawJSON = strings.TrimSpace(rawJSON)
	if rawJSON == "" || rawJSON == "{}" {
		return ""
	}

	cfg, err := parseJVMConfig(rawJSON)
	if err != nil {
		// If unmarshaling fails, return trimmed raw input to be resilient
		return rawJSON
	}

	return cfg.ToFlags()
}

// MergeJVMOptions merges template-level and service-level JVM options JSON strings.
// Service options override template options. Returns the merged JSON string.
func (e *Engine) MergeJVMOptions(tplJSON, svcJSON string) (string, error) {
	tplCfg, err := parseJVMConfig(tplJSON)
	if err != nil {
		return "", fmt.Errorf("invalid template JVM options: %w", err)
	}

	svcCfg, err := parseJVMConfig(svcJSON)
	if err != nil {
		return "", fmt.Errorf("invalid service JVM options: %w", err)
	}

	merged := mergeJVMConfigs(tplCfg, svcCfg)
	data, err := json.Marshal(merged)
	if err != nil {
		return "", fmt.Errorf("failed to marshal merged JVM options: %w", err)
	}
	return string(data), nil
}

// RenderStartCommand compiles and renders the startup command for a service based on its template and parameters.
func (e *Engine) RenderStartCommand(tpl *model.Template, svc *model.Service, jdk *model.JDKAsset, pkgPath string) (string, error) {
	if tpl == nil {
		return "", fmt.Errorf("template cannot be nil")
	}
	if svc == nil {
		return "", fmt.Errorf("service cannot be nil")
	}

	installDir := svc.InstallDir
	if installDir == "" {
		installDir = e.RenderInstallDir(tpl.InstallDirPattern, svc.Name)
	}

	javaBin := "java"
	if jdk != nil && strings.TrimSpace(jdk.BinPath) != "" {
		javaBin = strings.TrimSpace(jdk.BinPath)
	}

	portStr := ""
	if svc.Port > 0 {
		portStr = strconv.Itoa(svc.Port)
	}

	// Merge JVM options
	tplCfg, err := parseJVMConfig(tpl.JVMOptions)
	if err != nil {
		return "", fmt.Errorf("invalid template JVM options: %w", err)
	}
	svcCfg, err := parseJVMConfig(svc.JVMOptions)
	if err != nil {
		return "", fmt.Errorf("invalid service JVM options: %w", err)
	}
	mergedJVM := mergeJVMConfigs(tplCfg, svcCfg)

	// Merge Environment Variables
	mergedEnv, err := e.RenderEnvVars(tpl, svc)
	if err != nil {
		return "", fmt.Errorf("failed to render environment variables: %w", err)
	}

	// Build variable expansion map: custom envs prefixed with ENV_ and plain key (if not reserved)
	vars := make(map[string]string)
	for k, v := range mergedEnv {
		vars["ENV_"+k] = v
		if !reservedVars[k] {
			vars[k] = v
		}
	}

	// Reserved system variables always take precedence
	vars["SERVICE_NAME"] = svc.Name
	vars["INSTALL_DIR"] = installDir
	vars["PACKAGE_FILE"] = pkgPath
	vars["JAVA_BIN"] = javaBin
	vars["PORT"] = portStr

	// Expand variables inside JVM options (e.g. -XX:HeapDumpPath=${INSTALL_DIR}/logs/)
	jvmOpts := e.ExpandVariables(mergedJVM.ToFlags(), vars)
	vars["JVM_OPTS"] = jvmOpts

	// If template provides custom StartCmd, expand and return
	if strings.TrimSpace(tpl.StartCmd) != "" {
		return e.ExpandVariables(strings.TrimSpace(tpl.StartCmd), vars), nil
	}

	// Default commands based on template type
	switch tpl.Type {
	case model.TemplateTypeGenericArchive:
		return filepath.Join(installDir, "bin", "startup.sh"), nil
	case model.TemplateTypeJavaJar, model.TemplateTypeJavaWar, "":
		var parts []string
		parts = append(parts, javaBin)
		if jvmOpts != "" {
			parts = append(parts, jvmOpts)
		}
		if pkgPath != "" {
			parts = append(parts, "-jar", pkgPath)
		}
		if svc.Port > 0 {
			parts = append(parts, fmt.Sprintf("--server.port=%d", svc.Port))
		}
		return strings.Join(parts, " "), nil
	default:
		return filepath.Join(installDir, "bin", "startup.sh"), nil
	}
}

// RenderStopCommand renders the stop command for a service.
func (e *Engine) RenderStopCommand(tpl *model.Template, svc *model.Service) (string, error) {
	if tpl == nil {
		return "", fmt.Errorf("template cannot be nil")
	}
	if svc == nil {
		return "", fmt.Errorf("service cannot be nil")
	}

	installDir := svc.InstallDir
	if installDir == "" {
		installDir = e.RenderInstallDir(tpl.InstallDirPattern, svc.Name)
	}

	vars := map[string]string{
		"SERVICE_NAME": svc.Name,
		"INSTALL_DIR":  installDir,
		"PORT":         strconv.Itoa(svc.Port),
	}

	if strings.TrimSpace(tpl.StopCmd) != "" {
		return e.ExpandVariables(strings.TrimSpace(tpl.StopCmd), vars), nil
	}

	if tpl.Type == model.TemplateTypeGenericArchive {
		return filepath.Join(installDir, "bin", "shutdown.sh"), nil
	}

	return "", nil
}

// RenderInstallDir expands the installation directory pattern with service attributes.
func (e *Engine) RenderInstallDir(pattern string, serviceName string) string {
	if pattern == "" {
		return filepath.Join("/opt/apps", serviceName)
	}
	res := strings.ReplaceAll(pattern, "${SERVICE_NAME}", serviceName)
	return strings.ReplaceAll(res, "$SERVICE_NAME", serviceName)
}

// RenderUnpackCommand returns the shell command to unpack an archive package.
func (e *Engine) RenderUnpackCommand(pkgPath string, targetDir string) string {
	if strings.HasSuffix(strings.ToLower(pkgPath), ".zip") {
		return fmt.Sprintf("unzip -o %s -d %s", pkgPath, targetDir)
	}
	return fmt.Sprintf("tar -zxvf %s -C %s --strip-components=1", pkgPath, targetDir)
}

// RenderEnvVars combines template-level and service-level environment variables JSON strings.
// Service variables override template variables.
func (e *Engine) RenderEnvVars(tpl *model.Template, svc *model.Service) (map[string]string, error) {
	result := make(map[string]string)

	if tpl != nil && strings.TrimSpace(tpl.EnvVars) != "" && strings.TrimSpace(tpl.EnvVars) != "{}" {
		var tplEnv map[string]string
		if err := json.Unmarshal([]byte(tpl.EnvVars), &tplEnv); err != nil {
			return nil, fmt.Errorf("invalid template env_vars JSON: %w", err)
		}
		for k, v := range tplEnv {
			result[k] = v
		}
	}

	if svc != nil && strings.TrimSpace(svc.EnvVars) != "" && strings.TrimSpace(svc.EnvVars) != "{}" {
		var svcEnv map[string]string
		if err := json.Unmarshal([]byte(svc.EnvVars), &svcEnv); err != nil {
			return nil, fmt.Errorf("invalid service env_vars JSON: %w", err)
		}
		for k, v := range svcEnv {
			result[k] = v
		}
	}

	return result, nil
}

// ExpandVariables replaces ${VAR} placeholders with corresponding values from the vars map.
func (e *Engine) ExpandVariables(text string, vars map[string]string) string {
	if text == "" || len(vars) == 0 {
		return text
	}

	// Sort keys by length in descending order to avoid prefix collisions
	keys := make([]string, 0, len(vars))
	for k := range vars {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		return len(keys[i]) > len(keys[j])
	})

	result := text
	for _, k := range keys {
		v := vars[k]
		result = strings.ReplaceAll(result, "${"+k+"}", v)
	}
	return result
}

// parseJVMConfig parses raw JSON or raw flags into a JVMConfig struct.
func parseJVMConfig(rawJSON string) (*JVMConfig, error) {
	rawJSON = strings.TrimSpace(rawJSON)
	if rawJSON == "" || rawJSON == "{}" {
		return &JVMConfig{}, nil
	}

	var m map[string]interface{}
	if err := json.Unmarshal([]byte(rawJSON), &m); err != nil {
		// If not JSON, but starts with '-', treat as custom flags
		if strings.HasPrefix(rawJSON, "-") {
			return &JVMConfig{Custom: rawJSON}, nil
		}
		return nil, fmt.Errorf("failed to parse JVM options JSON: %w", err)
	}

	cfg := &JVMConfig{}
	for k, v := range m {
		key := strings.ToLower(strings.ReplaceAll(k, "_", ""))
		switch key {
		case "heapmin", "xms":
			if s, ok := v.(string); ok {
				cfg.HeapMin = s
			}
		case "heapmax", "xmx":
			if s, ok := v.(string); ok {
				cfg.HeapMax = s
			}
		case "gc":
			if s, ok := v.(string); ok {
				cfg.GC = s
			}
		case "oomdump":
			switch val := v.(type) {
			case bool:
				b := val
				cfg.OOMDump = &b
			case string:
				b := strings.EqualFold(val, "true") || val == "1"
				cfg.OOMDump = &b
			}
		case "dumppath", "heapdumppath":
			if s, ok := v.(string); ok {
				cfg.DumpPath = s
			}
		case "custom":
			if s, ok := v.(string); ok {
				cfg.Custom = s
			}
		}
	}
	return cfg, nil
}

// mergeJVMConfigs merges service JVM options onto template JVM options.
func mergeJVMConfigs(tpl, svc *JVMConfig) *JVMConfig {
	if tpl == nil && svc == nil {
		return &JVMConfig{}
	}
	if tpl == nil {
		return svc
	}
	if svc == nil {
		return tpl
	}

	merged := &JVMConfig{
		HeapMin:  tpl.HeapMin,
		HeapMax:  tpl.HeapMax,
		GC:       tpl.GC,
		DumpPath: tpl.DumpPath,
		Custom:   tpl.Custom,
	}
	if tpl.OOMDump != nil {
		b := *tpl.OOMDump
		merged.OOMDump = &b
	}

	if svc.HeapMin != "" {
		merged.HeapMin = svc.HeapMin
	}
	if svc.HeapMax != "" {
		merged.HeapMax = svc.HeapMax
	}
	if svc.GC != "" {
		merged.GC = svc.GC
	}
	if svc.OOMDump != nil {
		b := *svc.OOMDump
		merged.OOMDump = &b
	}
	if svc.DumpPath != "" {
		merged.DumpPath = svc.DumpPath
	}
	if svc.Custom != "" {
		merged.Custom = svc.Custom
	}

	return merged
}
