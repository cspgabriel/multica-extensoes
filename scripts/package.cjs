'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const version=require('../package.json').version;
const destination=path.join(root,'dist');
const stage=path.join(destination,'package-'+crypto.randomUUID());
fs.mkdirSync(stage,{recursive:true});
const include=['src','pool','lib','docs','scripts/Common.ps1','compatibility.json','package.json','README.md','LICENSE','NOTICE.md','Instalar.ps1','Desinstalar.ps1','Instalar.cmd','Desinstalar.cmd'];
for(const item of include){const target=path.join(stage,item);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(root,item),target,{recursive:true});}
function normalize(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const name=path.join(directory,entry.name);if(entry.isDirectory())normalize(name);else if(entry.name.endsWith('.ps1')){const text=fs.readFileSync(name,'utf8').replace(/^\uFEFF/,'');fs.writeFileSync(name,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]));}else if(entry.name.endsWith('.cmd')){fs.writeFileSync(name,fs.readFileSync(name,'utf8').replace(/\r?\n/g,'\r\n'));}}}
normalize(stage);
const zipName=`multica-extensoes-${version}-windows-x64.zip`;
const archive=path.join(destination,zipName);
execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Get-ChildItem -LiteralPath $env:MEXT_PACKAGE_STAGE | Compress-Archive -DestinationPath $env:MEXT_PACKAGE_ZIP -Force"],{env:{...process.env,MEXT_PACKAGE_STAGE:stage,MEXT_PACKAGE_ZIP:archive},stdio:'pipe'});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const zipHash=sha(archive);
const bootstrapName='Instalar-Multica-Extensoes.ps1';
const bootstrap=`# Multica Extensões ${version}. Baixa uma versão fixa e verifica o SHA-256 antes de executar.
[CmdletBinding()]
param([string]$MulticaPath,[string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'MulticaExtensoes'),[string]$Profile='desktop-api.multica.ai',[switch]$Yes,[switch]$NoRestart)
$ErrorActionPreference='Stop'
if($env:MULTICA_TASK_ID -or $env:MULTICA_TASK_CONFIG_ROOT){throw 'Execute manualmente na sessão do Windows, fora de uma tarefa de agente.'}
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$cache=Join-Path $InstallRoot ('downloads\\${version}-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $cache -Force|Out-Null
$archive=Join-Path $cache '${zipName}'
Write-Host 'Baixando Multica Extensões ${version}...'
Invoke-WebRequest -Uri 'https://github.com/cspgabriel/multica-extensoes/releases/download/v${version}/${zipName}' -OutFile $archive -UseBasicParsing
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '${zipHash}'){throw 'O download não corresponde ao SHA-256 da versão. Nenhum código baixado foi executado.'}
$package=Join-Path $cache 'package'
Expand-Archive -LiteralPath $archive -DestinationPath $package
$parameters=@{InstallRoot=$InstallRoot;Profile=$Profile;Yes=$Yes;NoRestart=$NoRestart}
if($MulticaPath){$parameters.MulticaPath=$MulticaPath}
& (Join-Path $package 'Instalar.ps1') @parameters
`;
const bootstrapPath=path.join(destination,bootstrapName);
fs.writeFileSync(bootstrapPath,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(bootstrap)]));
const sums=`${zipHash}  ${zipName}\n${sha(bootstrapPath)}  ${bootstrapName}\n`;
fs.writeFileSync(path.join(destination,'SHA256SUMS.txt'),sums);
fs.writeFileSync(path.join(destination,'package-manifest.json'),JSON.stringify({version,archive:zipName,sha256:zipHash,bootstrap:bootstrapName,files:include},null,2));
console.log(JSON.stringify({version,archive,bootstrap:bootstrapPath,sha256:zipHash}));
