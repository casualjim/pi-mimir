import { expect, test } from "vitest"
import { KUBECTL_BLOCKED } from "../lib/guards/kubectl-secret-guard.ts"

const blockedGetSecret = [
  "kubectl get secret",
  "kubectl get secrets",
  "kubectl get secret my-secret",
  "kubectl get secrets -n default",
  "kubectl --context my-context get secret",
  "kubectl -n kube-system get secret aws-creds",
  "kubectl get secret --all-namespaces",
  "kubectl get secrets -o yaml",
  "kubectl get secret my-secret -o json",
  "kubectl get -n prod secret/db-password",
  "kubectl --namespace staging get secrets",
  "kubectl -c my-cluster get secret",
  "kubectl --context lotsa-hetzner-dev -n restate-hello get secret",
  "kubectl get secret -o jsonpath='{.data.password}'",
  "kubectl get secrets --sort-by=.metadata.creationTimestamp",
  "kubectl -n monitoring get secret prometheus-tls",
  "kubectl --as=admin get secret",
  "kubectl --as-group=system:masters get secrets",
  "KUBECONFIG=/tmp/config kubectl get secret",
  "kubectl get   secret",
  "kubectl    get    secrets",
  "kubectl\\\nget secret",
  "kubectl get secret && echo done",
  "kubectl get secret; echo done",
  "kubectl get secret | grep name",
  "kubectl get secret > out.txt",
  "cat x | kubectl get secret -f -",
]

const blockedPatchFinalizers = [
  "kubectl patch deployment my-app -p '{\"metadata\":{\"finalizers\":[]}}'",
  "kubectl patch restatedeployment.restate.dev hello-world --type=merge -p '{\"metadata\":{\"finalizers\":[]}}'",
  "kubectl --context lotsa-hetzner-dev -n restate-hello patch restatedeployment.restate.dev hello-world --type=merge -p '{\"metadata\":{\"finalizers\":[]}}'",
  "kubectl -n prod patch secret my-secret -p '{\"metadata\":{\"finalizers\":[]}}'",
  "kubectl patch pod my-pod --patch '{\"metadata\":{\"finalizers\":null}}'",
  "kubectl patch crd mycrd.mygroup.io --type=merge -p '{\"metadata\":{\"finalizers\":[]}}'",
  "kubectl --context my-context patch ns my-ns -p '{\"finalizers\":[]}'",
  "kubectl patch configmap cm --type strategic -p '{\"metadata\":{\"finalizers\":[\"my-finalizer\"]}}'",
  "kubectl -n kube-system patch secret admin-creds --type=json -p '[{\"op\":\"replace\",\"path\":\"/metadata/finalizers\",\"value\":[]}]'",
  "kubectl patch deploy app --subresource=status -p '{\"metadata\":{\"finalizers\":[]}}'",
  "kubectl patch svc my-service -p '{\"metadata\":{\"finalizers\":[]}}' && echo done",
  "kubectl patch pv pvc-123 -p '{\"metadata\":{\"finalizers\":[]}}'; kubectl get pv",
  "kubectl patch --help || kubectl patch ns x -p '{\"finalizers\":[]}'",
  "kubectl patch myresource myobj -p '{\"metadata\":{\"finalizers\":[]}}'",
  "kubectl\\\npatch\\\nmy-resource\\\n-p '{\"finalizers\":[]}'",
  "KUBECONFIG=~/kubeconfig kubectl patch secret s -p '{\"metadata\":{\"finalizers\":[]}}'",
]

const allowed = [
  "kubectl get pods",
  "kubectl get deployments",
  "kubectl get cm",
  "kubectl describe secret my-secret",
  "kubectl create secret generic my-secret",
  "kubectl delete secret my-secret",
  "kubectl apply -f secret.yaml",
  "kubectl edit secret my-secret",
  "kubectl rollout restart deployment/app",
  "kubectl logs deployment/app",
  "kubectl exec -it pod/app -- sh",
  "kubectl get secretfile",
  "kubectl get mysecrets",
  "kubectl patch deployment app -p '{\"spec\":{\"replicas\":3}}'",
  "kubectl patch configmap cm -p '{\"data\":{\"key\":\"value\"}}'",
  "kubectl patch svc my-svc --type=merge -p '{\"spec\":{\"type\":\"NodePort\"}}'",
  "kubectl patch pod my-pod -p '{\"metadata\":{\"labels\":{\"app\":\"new\"}}}'",
  "kubectl patch ingress ing -p '{\"metadata\":{\"annotations\":{\"x\":\"y\"}}}'",
  "kubectl patch --help",
  "ls kubectl",
  "mykubectl get secret",
  "kubectlget secret",
  "kubectl-secrets get",
  "true && kubectl get pods",
  "kubectl get pods; echo secret",
  "echo finalizers",
  "patch finalizers",
  "get secret",
]

for (const cmd of blockedGetSecret) {
  test(`kubectl blocks get secret: ${cmd}`, () => {
    const m = KUBECTL_BLOCKED.exec(cmd)
    expect(m).not.toBeNull()
    expect(m?.[1]).toBeDefined()
  })
}

for (const cmd of blockedPatchFinalizers) {
  test(`kubectl blocks patch finalizers: ${cmd}`, () => {
    const m = KUBECTL_BLOCKED.exec(cmd)
    expect(m).not.toBeNull()
    expect(m?.[2]).toBeDefined()
  })
}

for (const cmd of allowed) {
  test(`kubectl allows: ${cmd}`, () => {
    expect(KUBECTL_BLOCKED.test(cmd)).toBe(false)
  })
}
