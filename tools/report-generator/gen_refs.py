# -*- coding: utf-8 -*-
from docxbuild import *
from links import U


def build(d):
    d.h1("บรรณานุกรม")
    d.p("รายการอ้างอิงจัดรูปแบบตามมาตรฐาน APA ฉบับที่ 7 เรียงตามลำดับอักษรของผู้แต่ง "
        "โดยแหล่งอ้างอิงประเภทเอกสารออนไลน์ระบุ URL ที่เข้าถึงได้จริง ณ วันที่ 27 กรกฎาคม 2569 "
        "คำที่มีเส้นใต้ในรายการนี้เป็น hyperlink ที่นำไปยังเอกสารต้นทางโดยตรง", indent_first=True)

    d.h2("เอกสารมาตรฐานและข้อกำหนดทางเทคนิค")
    d.ref([T("Barnes, R., Hoffman-Andrews, J., McCarney, D., & Kasten, J. (2019). "),
           I("Automatic Certificate Management Environment (ACME) "), T("(RFC 8555). "
             "Internet Engineering Task Force. "), L("https://www.rfc-editor.org/rfc/rfc8555", U["acme"])])
    d.ref([T("Barth, A. (2011). "), I("HTTP state management mechanism "),
           T("(RFC 6265). Internet Engineering Task Force. "),
           L("https://www.rfc-editor.org/rfc/rfc6265", U["cookie_rfc"])])
    d.ref([T("Dworkin, M. (2007). "),
           I("Recommendation for block cipher modes of operation: Galois/Counter Mode (GCM) and GMAC "),
           T("(NIST Special Publication 800-38D). National Institute of Standards and Technology. "),
           L("https://csrc.nist.gov/pubs/sp/800/38/d/final", U["gcm"])])
    d.ref([T("Grassi, P. A., Fenton, J. L., Newton, E. M., Perlner, R. A., Regenscheid, A. R., "
             "Burr, W. E., & Richer, J. P. (2017). "),
           I("Digital identity guidelines: Authentication and lifecycle management "),
           T("(NIST Special Publication 800-63B). National Institute of Standards and Technology. "),
           L("https://pages.nist.gov/800-63-3/sp800-63b.html", U["sp80063b"])])
    d.ref([T("Hardt, D. (2012). "), I("The OAuth 2.0 authorization framework "),
           T("(RFC 6749). Internet Engineering Task Force. "),
           L("https://www.rfc-editor.org/rfc/rfc6749", U["oauth2"])])
    d.ref([T("Kent, K., & Souppaya, M. (2006). "), I("Guide to computer security log management "),
           T("(NIST Special Publication 800-92). National Institute of Standards and Technology. "),
           L("https://csrc.nist.gov/pubs/sp/800/92/final", U["sp80092"])])
    d.ref([T("Klensin, J. (2008). "), I("Simple Mail Transfer Protocol "),
           T("(RFC 5321). Internet Engineering Task Force. "),
           L("https://www.rfc-editor.org/rfc/rfc5321", U["smtp"])])
    d.ref([T("Krawczyk, H., Bellare, M., & Canetti, R. (1997). "),
           I("HMAC: Keyed-hashing for message authentication "),
           T("(RFC 2104). Internet Engineering Task Force. "),
           L("https://www.rfc-editor.org/rfc/rfc2104", U["hmac"])])
    d.ref([T("M'Raihi, D., Machani, S., Pei, M., & Rydell, J. (2011). "),
           I("TOTP: Time-based one-time password algorithm "),
           T("(RFC 6238). Internet Engineering Task Force. "),
           L("https://www.rfc-editor.org/rfc/rfc6238", U["totp"])])
    d.ref([T("National Institute of Standards and Technology. (2001). "),
           I("Advanced Encryption Standard (AES) "), T("(FIPS PUB 197). "),
           L("https://csrc.nist.gov/pubs/fips/197/final", U["aes"])])
    d.ref([T("National Institute of Standards and Technology. (2015). "),
           I("Secure Hash Standard (SHS) "), T("(FIPS PUB 180-4). "),
           L("https://csrc.nist.gov/pubs/fips/180-4/upd1/final", U["sha256"])])
    d.ref([T("Rekhter, Y., Moskowitz, B., Karrenberg, D., de Groot, G. J., & Lear, E. (1996). "),
           I("Address allocation for private internets "),
           T("(RFC 1918). Internet Engineering Task Force. "),
           L("https://www.rfc-editor.org/rfc/rfc1918", U["rfc1918"])])
    d.ref([T("Rose, S., Borchert, O., Mitchell, S., & Connelly, S. (2020). "),
           I("Zero trust architecture "),
           T("(NIST Special Publication 800-207). National Institute of Standards and Technology. "),
           L("https://csrc.nist.gov/pubs/sp/800/207/final", U["zerotrust"])])
    d.ref([T("Souppaya, M., Morello, J., & Scarfone, K. (2017). "),
           I("Application container security guide "),
           T("(NIST Special Publication 800-190). National Institute of Standards and Technology. "),
           L("https://csrc.nist.gov/pubs/sp/800/190/final", U["sp800190"])])

    d.h2("บทความวิชาการและหนังสือ")
    d.ref([T("Hevner, A. R., March, S. T., Park, J., & Ram, S. (2004). Design science in "
             "information systems research. "), I("MIS Quarterly, 28"), T("(1), 75–105. "),
           L("https://aisel.aisnet.org/misq/vol28/iss1/6/", U["dsr"])])
    d.ref([T("Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in "
             "computer systems. "), I("Proceedings of the IEEE, 63"), T("(9), 1278–1308. "),
           L("https://web.mit.edu/Saltzer/www/publications/protection/", U["saltzer"])])
    d.ref([T("Fowler, M. (2010). "), I("BlueGreenDeployment"), T(". martinfowler.com. "),
           L("https://martinfowler.com/bliki/BlueGreenDeployment.html", U["bluegreen"])])
    d.ref([T("Wiggins, A. (2017). "), I("The twelve-factor app"), T(". "),
           L("https://12factor.net/", U["twelvefactor"])])

    d.h2("แนวปฏิบัติและกรอบด้านความปลอดภัย")
    d.ref([T("Center for Internet Security. (2024). "), I("CIS Docker Benchmark"), T(". "),
           L("https://www.cisecurity.org/benchmark/docker", U["cis_docker"])])
    d.ref([T("Cybersecurity and Infrastructure Security Agency. (2021). "),
           I("Defending against software supply chain attacks"), T(". "),
           L("https://www.cisa.gov/news-events/news/defending-against-software-supply-chain-attacks",
             U["supplychain"])])
    d.ref([T("Cybersecurity and Infrastructure Security Agency. (n.d.). "),
           I("Software Bill of Materials (SBOM)"), T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://www.cisa.gov/sbom", U["sbom"])])
    d.ref([T("FIRST. (n.d.). "), I("Common Vulnerability Scoring System (CVSS)"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://www.first.org/cvss/", U["cvss"])])
    d.ref([T("MITRE Corporation. (n.d.). "), I("Common Weakness Enumeration (CWE)"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://cwe.mitre.org/", U["cwe"])])
    d.ref([T("MITRE Corporation. (n.d.). "), I("MITRE ATT&CK"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://attack.mitre.org/", U["attack"])])
    d.ref([T("National Vulnerability Database. (2019). "), I("CVE-2019-5736 detail"),
           T(". National Institute of Standards and Technology. "),
           L("https://nvd.nist.gov/vuln/detail/CVE-2019-5736", U["cve2019_5736"])])
    d.ref([T("OpenSSF. (2023). "), I("SLSA specification version 1.0"), T(". "),
           L("https://slsa.dev/spec/v1.0/about", U["slsa"])])
    d.ref([T("OWASP Foundation. (2021). "), I("OWASP Top 10: The ten most critical web "
                                              "application security risks"), T(". "),
           L("https://owasp.org/www-project-top-ten/", U["owasptop10"])])
    d.ref([T("OWASP Foundation. (2022). "), I("OWASP Top 10 CI/CD security risks"), T(". "),
           L("https://owasp.org/www-project-top-10-ci-cd-security-risks/", U["owaspcicd"])])
    d.ref([T("OWASP Foundation. (n.d.). "), I("Secrets management cheat sheet"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html",
             U["owaspsecrets"])])
    d.ref([T("OWASP Foundation. (n.d.). "), I("Server side request forgery"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://owasp.org/www-community/attacks/Server_Side_Request_Forgery", U["ssrf"])])
    d.ref([T("OWASP Foundation. (n.d.). "), I("Cross site scripting (XSS)"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://owasp.org/www-community/attacks/xss/", U["xss"])])
    d.ref([T("Sigstore. (n.d.). "), I("How sigstore works"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://www.sigstore.dev/how-it-works", U["sigstore"])])
    d.ref([T("Snyk. (2018). "), I("Zip Slip vulnerability"), T(". "),
           L("https://security.snyk.io/research/zip-slip-vulnerability", U["zipslip"])])

    d.h2("เอกสารประกอบของเทคโนโลยีที่ใช้พัฒนา")
    d.ref([T("Docker Inc. (n.d.). "), I("Docker Engine security"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://docs.docker.com/engine/security/", U["dockersec"])])
    d.ref([T("Docker Inc. (n.d.). "), I("Packet filtering and firewalls"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://docs.docker.com/engine/network/packet-filtering-firewalls/",
             U["dockeruser_chain"])])
    d.ref([T("Docker Inc. (n.d.). "), I("Seccomp security profiles for Docker"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://docs.docker.com/engine/security/seccomp/", U["seccomp"])])
    d.ref([T("Electronic Frontier Foundation. (n.d.). "), I("Certbot documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://eff-certbot.readthedocs.io/en/stable/", U["certbot"])])
    d.ref([T("GitHub Inc. (n.d.). "), I("Validating webhook deliveries"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries",
             U["gh_sig"])])
    d.ref([T("Kubernetes Authors. (2024). "), I("Admission controllers reference"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/",
             U["admission"])])
    d.ref([T("Let's Encrypt. (n.d.). "), I("How it works"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://letsencrypt.org/how-it-works/", U["letsencrypt"])])
    d.ref([T("Linux man-pages project. (n.d.). "), I("capabilities(7) — Linux manual page"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://man7.org/linux/man-pages/man7/capabilities.7.html", U["capabilities"])])
    d.ref([T("Linux man-pages project. (n.d.). "), I("cgroups(7) — Linux manual page"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://man7.org/linux/man-pages/man7/cgroups.7.html", U["cgroups"])])
    d.ref([T("Linux man-pages project. (n.d.). "), I("namespaces(7) — Linux manual page"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://man7.org/linux/man-pages/man7/namespaces.7.html", U["namespaces"])])
    d.ref([T("NestJS. (n.d.). "), I("NestJS documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://docs.nestjs.com/", U["nestjs"])])
    d.ref([T("Node.js. (n.d.). "), I("Crypto module documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://nodejs.org/api/crypto.html", U["nodecrypto"])])
    d.ref([T("Open Policy Agent. (n.d.). "), I("Gatekeeper documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://open-policy-agent.github.io/gatekeeper/website/docs/", U["opa"])])
    d.ref([T("PostgreSQL Global Development Group. (n.d.). "),
           I("PostgreSQL 16 documentation"), T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://www.postgresql.org/docs/16/index.html", U["postgres"])])
    d.ref([T("Supabase. (n.d.). "), I("Auth documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://supabase.com/docs/guides/auth", U["supabase"])])
    d.ref([T("Tecnativa. (n.d.). "), I("docker-socket-proxy"),
           T(". GitHub. สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://github.com/Tecnativa/docker-socket-proxy", U["socketproxy"])])
    d.ref([T("Vercel. (n.d.). "), I("Next.js documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://nextjs.org/docs", U["nextjs"])])

    d.h2("เครื่องมือด้านความปลอดภัยที่อ้างถึงเพื่อการเปรียบเทียบ")
    d.ref([T("Aqua Security. (n.d.). "), I("Trivy documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://trivy.dev/latest/docs/", U["trivy"])])
    d.ref([T("Gitleaks. (n.d.). "), I("Gitleaks: Protect and discover secrets"),
           T(". GitHub. สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://github.com/gitleaks/gitleaks", U["gitleaks"])])
    d.ref([T("Google. (n.d.). "), I("gVisor documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://gvisor.dev/docs/", U["gvisor"])])
    d.ref([T("HashiCorp. (n.d.). "), I("What is Vault?"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://developer.hashicorp.com/vault/docs/what-is-vault", U["vault"])])
    d.ref([T("Open Source Vulnerabilities. (n.d.). "), I("OSV: Open Source Vulnerability database"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://osv.dev/", U["osv"])])
    d.ref([T("Semgrep. (n.d.). "), I("Semgrep documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://semgrep.dev/docs/", U["semgrep"])])
    d.ref([T("Truffle Security. (n.d.). "), I("TruffleHog"),
           T(". GitHub. สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://github.com/trufflesecurity/trufflehog", U["trufflehog"])])

    d.h2("แพลตฟอร์มนำส่งซอฟต์แวร์ที่ใช้ในการเปรียบเทียบ")
    d.ref([T("CapRover. (n.d.). "), I("Get started"), T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://caprover.com/docs/get-started.html", U["caprover"])])
    d.ref([T("Coolify. (n.d.). "), I("Coolify documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://coolify.io/docs/", U["coolify"])])
    d.ref([T("Dokku. (n.d.). "), I("Dokku documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "),
           L("https://dokku.com/docs/getting-started/installation/", U["dokku"])])
    d.ref([T("Railway. (n.d.). "), I("Railway documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://docs.railway.com/", U["railway"])])
    d.ref([T("Render. (n.d.). "), I("Render documentation"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://render.com/docs", U["render"])])
    d.ref([T("Salesforce. (n.d.). "), I("Heroku Dev Center"),
           T(". สืบค้นเมื่อ 27 กรกฎาคม 2569, จาก "), L("https://devcenter.heroku.com/", U["heroku"])])
