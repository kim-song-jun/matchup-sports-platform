---
"v1_api": patch
"v1_web": patch
---

Disable buildx provenance/SBOM attestation on the alpha image builds. Since switching to the docker-container buildx driver, build-push-action pushed images as an OCI image index wrapping a provenance attestation manifest, which ECR's basic scanner never registers a scan for (confirmed via a temporary diagnostic step: describe-images showed no imageScanStatus field at all, and the manifest media type was application/vnd.oci.image.index.v1+json). This is a documented BuildKit v0.11+/ECR interaction; provenance: false + sbom: false restores a plain single-manifest push that ECR can scan.
