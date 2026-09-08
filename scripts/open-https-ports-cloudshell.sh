#!/bin/bash
# Pegar en Oracle Cloud Shell (mx-queretaro-1)
# Abre HTTPS/HTTP para Let's Encrypt + Caddy
set -euo pipefail

OCI_TENANCY="${OCI_TENANCY:-ocid1.tenancy.oc1..aaaaaaaajwm2m7k5llgxl3rbwphwkeytzox6mxeiouu6nbms2hnmiyioclna}"

NSG=$(oci network nsg list --compartment-id "$OCI_TENANCY" --all \
  --query "data[?contains(\"display-name\",'ig-quick-action')].id | [0]" --raw-output)
echo "NSG=$NSG"
if [ -z "$NSG" ] || [ "$NSG" = "null" ]; then
  echo "No se encontro NSG ig-quick-action; listando NSGs:"
  oci network nsg list --compartment-id "$OCI_TENANCY" --all --query "data[].{name:\"display-name\",id:id}" --output table
  exit 1
fi

oci network nsg rules add --nsg-id "$NSG" --security-rules '[
  {"description":"HTTP ACME","direction":"INGRESS","isStateless":false,"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
  {"description":"HTTPS","direction":"INGRESS","isStateless":false,"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","tcpOptions":{"destinationPortRange":{"min":443,"max":443}}}
]'

echo "OK: puertos 80 y 443 abiertos. En 1-2 min Caddy obtiene el certificado."
echo "URL: https://163.192.146.143.sslip.io/"
