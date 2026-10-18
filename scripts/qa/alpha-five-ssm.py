"""Task-scoped alpha-only SSM runner; never prints runtime credentials."""
import base64,json,subprocess,sys
from pathlib import Path
AWS='/mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe'
INSTANCE='i-07344f6ccf3f53c53';REGION='ap-northeast-2'
def aws(*args):
 r=subprocess.run([AWS,*args,'--region',REGION,'--output','json'],capture_output=True)
 def decode(raw):
  try:return raw.decode('utf-8')
  except UnicodeDecodeError:return raw.decode('cp949')
 if r.returncode:raise RuntimeError(decode(r.stderr))
 return json.loads(decode(r.stdout))
if sys.argv[1]=='send':
 identity=aws('sts','get-caller-identity')
 if identity['Account']!='851725525576':raise RuntimeError('Wrong AWS account')
 code=Path(sys.argv[2]).read_bytes()
 encoded=base64.b64encode(code).decode()
 apply=len(sys.argv)>3 and sys.argv[3]=='--apply'
 if len(sys.argv)>3 and not apply:raise ValueError('Only --apply is accepted')
 mode=' -e ALPHA_FIVE_APPLY=CREATE_ONLY' if apply else ''
 command="printf '%s' '"+encoded+"' | base64 -d | docker exec -i"+mode+" teameet_v1_api node -"
 data={'DocumentName':'AWS-RunShellScript','InstanceIds':[INSTANCE],'Comment':'Teameet alpha five requested round12 tournaments '+Path(sys.argv[2]).stem,'Parameters':{'commands':['set -eu',command],'executionTimeout':['300']}}
 params=Path('tmp/qa-alpha-five/ssm-parameters.json').resolve();params.parent.mkdir(parents=True,exist_ok=True);params.write_text(json.dumps(data))
 win=subprocess.check_output(['wslpath','-w',str(params)],text=True).strip()
 result=aws('ssm','send-command','--cli-input-json','file://'+win)
 print(result['Command']['CommandId'])
elif sys.argv[1]=='get':
 result=aws('ssm','get-command-invocation','--command-id',sys.argv[2],'--instance-id',INSTANCE)
 print(json.dumps({k:result[k] for k in ['Status','StandardOutputContent','StandardErrorContent']},ensure_ascii=False))
