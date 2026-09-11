package template_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/model"
	"opshub/internal/template"
)

func TestEngine_RenderJavaStartCommand(t *testing.T) {
	engine := template.NewEngine()

	tpl := &model.Template{
		Name:              "Standard-Spring-Boot",
		Type:              "java_jar",
		InstallDirPattern: "/opt/apps/${SERVICE_NAME}",
		JVMOptions:        `{"heap_min":"512m","heap_max":"1024m","gc":"-XX:+UseG1GC"}`,
		SupervisionMode:   "native",
	}

	svc := &model.Service{
		Name:       "order-service",
		InstallDir: "/opt/apps/order-service",
		Port:       8080,
		JVMOptions: `{"heap_max":"2048m"}`,
	}

	jdk := &model.JDKAsset{
		BinPath: "/usr/lib/jvm/java-17/bin/java",
	}

	cmd, err := engine.RenderStartCommand(tpl, svc, jdk, "/opt/apps/order-service/app.jar")
	require.NoError(t, err)

	assert.Contains(t, cmd, "/usr/lib/jvm/java-17/bin/java")
	assert.Contains(t, cmd, "-Xms512m")
	assert.Contains(t, cmd, "-Xmx2048m")
	assert.Contains(t, cmd, "-XX:+UseG1GC")
	assert.Contains(t, cmd, "-jar /opt/apps/order-service/app.jar")
	assert.Contains(t, cmd, "--server.port=8080")
}

func TestEngine_ParseJVMOptions(t *testing.T) {
	engine := template.NewEngine()

	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "empty json",
			input:    "",
			expected: nil,
		},
		{
			name:     "empty braces",
			input:    "{}",
			expected: nil,
		},
		{
			name:  "standard heap and gc",
			input: `{"heap_min":"512m","heap_max":"2048m","gc":"-XX:+UseG1GC"}`,
			expected: []string{
				"-Xms512m",
				"-Xmx2048m",
				"-XX:+UseG1GC",
			},
		},
		{
			name:  "gc short name mapping",
			input: `{"gc":"ZGC"}`,
			expected: []string{
				"-XX:+UseZGC",
			},
		},
		{
			name:  "oom dump and custom options",
			input: `{"heap_max":"1g","oom_dump":true,"dump_path":"/var/log/dump.hprof","custom":"-Denv=prod"}`,
			expected: []string{
				"-Xmx1g",
				"-XX:+HeapDumpOnOutOfMemoryError",
				"-XX:HeapDumpPath=/var/log/dump.hprof",
				"-Denv=prod",
			},
		},
		{
			name:  "raw flag string fallback",
			input: "-Xms256m -Xmx512m -server",
			expected: []string{
				"-Xms256m -Xmx512m -server",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			flags := engine.ParseJVMOptions(tc.input)
			if len(tc.expected) == 0 {
				assert.Empty(t, flags)
			} else {
				for _, exp := range tc.expected {
					assert.Contains(t, flags, exp)
				}
			}
		})
	}
}

func TestEngine_MergeJVMOptions(t *testing.T) {
	engine := template.NewEngine()

	tplJSON := `{"heap_min":"512m","heap_max":"1024m","gc":"-XX:+UseG1GC"}`
	svcJSON := `{"heap_max":"4096m","custom":"-Dspring.profiles.active=prod"}`

	mergedJSON, err := engine.MergeJVMOptions(tplJSON, svcJSON)
	require.NoError(t, err)

	flags := engine.ParseJVMOptions(mergedJSON)
	assert.Contains(t, flags, "-Xms512m")
	assert.Contains(t, flags, "-Xmx4096m")
	assert.Contains(t, flags, "-XX:+UseG1GC")
	assert.Contains(t, flags, "-Dspring.profiles.active=prod")

	// Test invalid JSON returns error
	_, err = engine.MergeJVMOptions("{invalid-json", "")
	assert.Error(t, err)
}

func TestEngine_RenderStartCommand_CustomTemplate(t *testing.T) {
	engine := template.NewEngine()

	tpl := &model.Template{
		Name:            "Custom-Java",
		Type:            "java_jar",
		StartCmd:        "${JAVA_BIN} ${JVM_OPTS} -Dapp=${SERVICE_NAME} -jar ${PACKAGE_FILE} --server.port=${PORT}",
		JVMOptions:      `{"heap_min":"256m","dump_path":"${INSTALL_DIR}/logs/oom.hprof","oom_dump":true}`,
		EnvVars:         `{"REGION":"us-east-1"}`,
		SupervisionMode: "native",
	}

	svc := &model.Service{
		Name:       "payment-svc",
		InstallDir: "/data/apps/payment-svc",
		Port:       9090,
		JVMOptions: `{"heap_max":"1024m"}`,
		EnvVars:    `{"REGION":"us-west-2","ZONE":"zone-a"}`,
	}

	cmd, err := engine.RenderStartCommand(tpl, svc, nil, "/data/apps/payment-svc/payment.jar")
	require.NoError(t, err)

	// Defaults to "java" when JDK is nil
	assert.Contains(t, cmd, "java ")
	assert.Contains(t, cmd, "-Xms256m")
	assert.Contains(t, cmd, "-Xmx1024m")
	assert.Contains(t, cmd, "-XX:HeapDumpPath=/data/apps/payment-svc/logs/oom.hprof")
	assert.Contains(t, cmd, "-Dapp=payment-svc")
	assert.Contains(t, cmd, "-jar /data/apps/payment-svc/payment.jar")
	assert.Contains(t, cmd, "--server.port=9090")
}

func TestEngine_RenderStartCommand_GenericArchive(t *testing.T) {
	engine := template.NewEngine()

	tpl := &model.Template{
		Name:              "Nacos-Middleware",
		Type:              model.TemplateTypeGenericArchive,
		InstallDirPattern: "/opt/middleware/${SERVICE_NAME}",
		SupervisionMode:   "native",
	}

	svc := &model.Service{
		Name:       "nacos-cluster",
		InstallDir: "/opt/middleware/nacos-cluster",
	}

	cmd, err := engine.RenderStartCommand(tpl, svc, nil, "/tmp/nacos.tar.gz")
	require.NoError(t, err)
	assert.Equal(t, "/opt/middleware/nacos-cluster/bin/startup.sh", cmd)

	stopCmd, err := engine.RenderStopCommand(tpl, svc)
	require.NoError(t, err)
	assert.Equal(t, "/opt/middleware/nacos-cluster/bin/shutdown.sh", stopCmd)
}

func TestEngine_RenderStartCommand_NilAndErrors(t *testing.T) {
	engine := template.NewEngine()

	_, err := engine.RenderStartCommand(nil, &model.Service{}, nil, "")
	assert.Error(t, err)

	_, err = engine.RenderStartCommand(&model.Template{}, nil, nil, "")
	assert.Error(t, err)

	tpl := &model.Template{
		Type:       "java_jar",
		JVMOptions: "{bad-json",
	}
	_, err = engine.RenderStartCommand(tpl, &model.Service{Name: "svc"}, nil, "")
	assert.Error(t, err)
}

func TestEngine_RenderStopCommand(t *testing.T) {
	engine := template.NewEngine()

	// Custom stop cmd
	tpl := &model.Template{
		Type:    "java_jar",
		StopCmd: "${INSTALL_DIR}/bin/stop.sh ${PORT}",
	}
	svc := &model.Service{
		Name:       "my-service",
		InstallDir: "/opt/apps/my-service",
		Port:       8080,
	}

	stopCmd, err := engine.RenderStopCommand(tpl, svc)
	require.NoError(t, err)
	assert.Equal(t, "/opt/apps/my-service/bin/stop.sh 8080", stopCmd)

	// Java Jar with no stop cmd returns empty string
	tplJava := &model.Template{Type: "java_jar"}
	stopCmd2, err := engine.RenderStopCommand(tplJava, svc)
	require.NoError(t, err)
	assert.Empty(t, stopCmd2)

	// Nil checks
	_, err = engine.RenderStopCommand(nil, svc)
	assert.Error(t, err)
	_, err = engine.RenderStopCommand(tpl, nil)
	assert.Error(t, err)
}

func TestEngine_RenderInstallDir(t *testing.T) {
	engine := template.NewEngine()

	assert.Equal(t, "/opt/apps/my-service", engine.RenderInstallDir("/opt/apps/${SERVICE_NAME}", "my-service"))
	assert.Equal(t, "/var/services/my-service", engine.RenderInstallDir("/var/services/$SERVICE_NAME", "my-service"))
	assert.Equal(t, "/opt/apps/my-service", engine.RenderInstallDir("", "my-service"))
}

func TestEngine_RenderUnpackCommand(t *testing.T) {
	engine := template.NewEngine()

	tarCmd := engine.RenderUnpackCommand("/tmp/pkg.tar.gz", "/opt/apps/demo")
	assert.Equal(t, "tar -zxvf /tmp/pkg.tar.gz -C /opt/apps/demo --strip-components=1", tarCmd)

	zipCmd := engine.RenderUnpackCommand("/tmp/pkg.zip", "/opt/apps/demo")
	assert.Equal(t, "unzip -o /tmp/pkg.zip -d /opt/apps/demo", zipCmd)
}

func TestEngine_RenderEnvVars(t *testing.T) {
	engine := template.NewEngine()

	tpl := &model.Template{
		EnvVars: `{"ENV":"prod","LOG_LEVEL":"INFO"}`,
	}
	svc := &model.Service{
		EnvVars: `{"LOG_LEVEL":"DEBUG","WORKERS":"4"}`,
	}

	merged, err := engine.RenderEnvVars(tpl, svc)
	require.NoError(t, err)
	assert.Equal(t, "prod", merged["ENV"])
	assert.Equal(t, "DEBUG", merged["LOG_LEVEL"]) // Service overrides template
	assert.Equal(t, "4", merged["WORKERS"])

	// Test multiline KEY=VALUE format (such as SPRING_PROFILES_ACTIVE=prod)
	tplKeyValue := &model.Template{
		EnvVars: "SPRING_PROFILES_ACTIVE=prod\nSERVER_PORT=8080",
	}
	svcKeyValue := &model.Service{
		EnvVars: "SERVER_PORT=9090\nCUSTOM_VAL=\"quoted-value\"",
	}
	mergedKV, err := engine.RenderEnvVars(tplKeyValue, svcKeyValue)
	require.NoError(t, err)
	assert.Equal(t, "prod", mergedKV["SPRING_PROFILES_ACTIVE"])
	assert.Equal(t, "9090", mergedKV["SERVER_PORT"])
	assert.Equal(t, "quoted-value", mergedKV["CUSTOM_VAL"])

	// Test invalid JSON and invalid key-value
	_, err = engine.RenderEnvVars(&model.Template{EnvVars: "invalid"}, nil)
	assert.Error(t, err)

	_, err = engine.RenderEnvVars(nil, &model.Service{EnvVars: "invalid"})
	assert.Error(t, err)
}

func TestEngine_AdditionalEdgeCases(t *testing.T) {
	engine := template.NewEngine()

	// Direct ToFlags with nil
	var nilCfg *template.JVMConfig
	assert.Empty(t, nilCfg.ToFlags())

	// Prefixed heap options and GC cases (Parallel, CMS, already prefixed)
	cfg := &template.JVMConfig{
		HeapMin: "-Xms1g",
		HeapMax: "-Xmx2g",
		GC:      "Parallel",
	}
	assert.Contains(t, cfg.ToFlags(), "-Xms1g")
	assert.Contains(t, cfg.ToFlags(), "-Xmx2g")
	assert.Contains(t, cfg.ToFlags(), "-XX:+UseParallelGC")

	cfgCMS := &template.JVMConfig{
		GC: "CMS",
	}
	assert.Contains(t, cfgCMS.ToFlags(), "-XX:+UseConcMarkSweepGC")

	// Empty install dir in Service resolved from Template pattern in Start and Stop
	tpl := &model.Template{
		Type:              model.TemplateTypeGenericArchive,
		InstallDirPattern: "/srv/apps/${SERVICE_NAME}",
	}
	svc := &model.Service{
		Name: "worker-svc",
	}
	startCmd, err := engine.RenderStartCommand(tpl, svc, nil, "")
	require.NoError(t, err)
	assert.Equal(t, "/srv/apps/worker-svc/bin/startup.sh", startCmd)

	stopCmd, err := engine.RenderStopCommand(tpl, svc)
	require.NoError(t, err)
	assert.Equal(t, "/srv/apps/worker-svc/bin/shutdown.sh", stopCmd)

	// Error when template or service has invalid env vars in RenderStartCommand
	tplBadEnv := &model.Template{
		EnvVars: "not-valid-json",
	}
	_, err = engine.RenderStartCommand(tplBadEnv, svc, nil, "")
	assert.Error(t, err)

	// MergeJVMOptions error with invalid service JSON
	_, err = engine.MergeJVMOptions(`{"heap_min":"512m"}`, "{bad-svc-json")
	assert.Error(t, err)
}

func TestEngine_ReviewFindings(t *testing.T) {
	engine := template.NewEngine()

	// Finding 1: Ensure installDir always falls back to RenderInstallDir default (/opt/apps/${SERVICE_NAME})
	// even if tpl.InstallDirPattern is empty and svc.InstallDir is empty.
	tplEmptyPattern := &model.Template{
		Type:              model.TemplateTypeGenericArchive,
		InstallDirPattern: "", // empty
	}
	svcEmptyDir := &model.Service{
		Name:       "default-dir-svc",
		InstallDir: "", // empty
	}
	startCmd, err := engine.RenderStartCommand(tplEmptyPattern, svcEmptyDir, nil, "")
	require.NoError(t, err)
	assert.Equal(t, "/opt/apps/default-dir-svc/bin/startup.sh", startCmd)

	stopCmd, err := engine.RenderStopCommand(tplEmptyPattern, svcEmptyDir)
	require.NoError(t, err)
	assert.Equal(t, "/opt/apps/default-dir-svc/bin/shutdown.sh", stopCmd)

	// Finding 2: In mergeJVMConfigs, allow explicit oom_dump: false on the service to override oom_dump: true from the template
	tplWithOOM := `{"heap_min":"512m","oom_dump":true,"dump_path":"/var/log/dump.hprof"}`
	svcDisableOOM := `{"oom_dump":false}`
	mergedJSON, err := engine.MergeJVMOptions(tplWithOOM, svcDisableOOM)
	require.NoError(t, err)
	flags := engine.ParseJVMOptions(mergedJSON)
	assert.Contains(t, flags, "-Xms512m")
	assert.NotContains(t, flags, "-XX:+HeapDumpOnOutOfMemoryError")

	// Finding 3: Protect reserved system variables from being overwritten by custom environment variables
	tplReserved := &model.Template{
		Type:     "java_jar",
		StartCmd: "echo name=${SERVICE_NAME} pkg=${PACKAGE_FILE} custom=${ENV_SERVICE_NAME}",
		EnvVars:  `{"SERVICE_NAME":"malicious-name"}`,
	}
	svcReserved := &model.Service{
		Name:       "real-service",
		InstallDir: "/opt/apps/real-service",
		EnvVars:    `{"PACKAGE_FILE":"fake-pkg","PORT":"99999"}`,
		Port:       8080,
	}
	rendered, err := engine.RenderStartCommand(tplReserved, svcReserved, nil, "/opt/apps/real-service/app.jar")
	require.NoError(t, err)
	assert.Contains(t, rendered, "name=real-service")
	assert.Contains(t, rendered, "pkg=/opt/apps/real-service/app.jar")
	assert.Contains(t, rendered, "custom=malicious-name")
	assert.NotContains(t, rendered, "name=malicious-name")
}


