"""Build and verify the runtime-only release; all temporary work stays in this workspace."""
from pathlib import Path
import json,re,zipfile,hashlib
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'.test-env/artifacts/v150';ART.mkdir(parents=True,exist_ok=True)
m=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8-sig'))
assert m['manifest_version']==3 and m['version']=='1.5.0'
files={'manifest.json',m['background']['service_worker'],m['action']['default_popup']}
files.update(m['icons'].values());files.update(m['action']['default_icon'].values())
for item in m['content_scripts']:files.update(item['js']);files.update(item['css'])
for file in list(files):
 if file.endswith('.html'):
  files.update(re.findall(r'(?:src|href)="([^":]+\.(?:js|css|png))"',(ROOT/file).read_text(encoding='utf-8-sig')))
for file in list(files):
 if file.endswith('.js'):
  for arguments in re.findall(r'importScripts\(([^)]+)\)',(ROOT/file).read_text(encoding='utf-8-sig')):
   files.update(re.findall(r'["\']([^"\']+)["\']',arguments))
assert len(files)==13,files
for file in files:
 assert (ROOT/file).is_file() and (ROOT/file).resolve().is_relative_to(ROOT)
 assert not any(part in {'tests','.test-env'} for part in Path(file).parts)
 if file.endswith('.png'):assert (ROOT/file).read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
release=ROOT/'release';release.mkdir(exist_ok=True)
archive=release/'sponsor-shield-1.5.0.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for file in sorted(files):z.write(ROOT/file,file)
unpacked=ROOT/'.test-env/release-unpacked-v150';unpacked.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None and set(z.namelist())==files
 assert json.loads(z.read('manifest.json'))==m
 for file in files:assert z.read(file)==(ROOT/file).read_bytes()
 z.extractall(unpacked)
report={'version':m['version'],'manifestValid':True,'allReferencesPresent':True,'runtimeFiles':sorted(files),'fileCount':len(files),'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'unpacked':str(unpacked),'sourceSha256':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in sorted(files)}}
(ART/'package-verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
