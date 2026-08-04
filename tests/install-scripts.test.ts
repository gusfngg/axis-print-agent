// tests/install-scripts.test.ts
//
// Os scripts de install/ nao tem cobertura de execucao (so rodam no Windows),
// e por isso divergiram do que de fato funciona no totem: a instalacao real de
// 2026-07-31 foi corrigida a mao na maquina e o repo ficou pra tras. Resultado:
// o agente ficou fora do ar sem nada reergue-lo.
//
// Estes testes travam as decisoes que fazem o agente subir e CONTINUAR no ar
// sob Assigned Access. Se alguem reverter uma delas, quebra aqui, nao na loja.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string): string => readFileSync(join(__dirname, "..", "install", f), "utf8");

const install = read("install.bat");
const run = read("run.bat");
const uninstall = read("uninstall.bat");

describe("install.bat — inicializacao que sobrevive ao Assigned Access", () => {
  it("cria a tarefa como ONSTART, nunca ONLOGON", () => {
    expect(install).toContain("/SC ONSTART");
    expect(install).not.toContain("/SC ONLOGON");
  });

  it("roda como SYSTEM, nao como a conta que instalou", () => {
    expect(install).toContain('/RU "SYSTEM"');
    expect(install).not.toContain('/RU "%USERNAME%"');
  });

  it("aponta a tarefa pro run.bat, nao pro .exe (o .exe no /TR nao executa)", () => {
    expect(install).toContain('/TR "\\"%DEST%\\run.bat\\""');
  });

  it("nunca cai pra pasta Startup — sem Explorer ela nunca e processada", () => {
    expect(install).not.toContain("GetFolderPath('Startup')");
  });

  it("instala em ProgramData, nao no perfil do usuario", () => {
    expect(install).toContain("set DEST=C:\\ProgramData\\Axis\\PrintAgent");
  });

  it("fixa o config dir por variavel de maquina (senao o token se perde)", () => {
    expect(install).toMatch(/setx AXIS_PRINT_CONFIG_DIR .* \/M/);
  });

  it("devolve o SYSTEM na ACL que lockdownConfigFile() remove", () => {
    expect(install).toContain("*S-1-5-18:(OI)(CI)F");
  });
});

describe("run.bat — supervisor", () => {
  it("reergue o agente em loop", () => {
    expect(run).toContain(":loop");
    expect(run).toContain("goto loop");
  });

  it("nao reinicia em saida limpa (quit pelo tray / ja rodando)", () => {
    expect(run).toContain('if "%CODE%"=="0"');
    expect(run).toContain("goto fim");
  });
});

describe("uninstall.bat", () => {
  it("derruba a tarefa ANTES do binario, senao o supervisor o reergue", () => {
    const tarefa = uninstall.indexOf("schtasks /Delete");
    const binario = uninstall.indexOf("taskkill /IM axis-print-agent.exe");
    expect(tarefa).toBeGreaterThan(-1);
    expect(binario).toBeGreaterThan(tarefa);
  });

  it("remove tambem o path novo em ProgramData", () => {
    expect(uninstall).toContain('rmdir /S /Q "C:\\ProgramData\\Axis\\PrintAgent"');
  });
});
