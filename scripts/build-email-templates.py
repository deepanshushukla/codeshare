#!/usr/bin/env python3
"""Builds supabase/templates/*.html -- the auth emails that carry a 6-digit code.

Run after editing this file:  python3 scripts/build-email-templates.py

Email HTML is its own dialect: table layout, inline styles, bgcolor
attributes (Outlook ignores CSS backgrounds), no oklch() and usually no web
fonts. Colours are the app's design tokens (src/styles/tokens.scss)
converted to hex; fonts fall back to system stacks where Unbounded / IBM Plex
are not available. The logo is the {CodeShare} wordmark in live text rather
than an image, because many clients block images by default.
"""
from pathlib import Path

BG, CARD, PANEL = "#010c0c", "#051515", "#0c1e1f"
TEXT, MUTED, FAINT = "#ebf4f3", "#a3b5b5", "#677879"
ACC, LINE = "#31e1c7", "#163533"
DISPLAY = "'Unbounded','Segoe UI',Helvetica,Arial,sans-serif"
SANS = "'IBM Plex Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
MONO = "'IBM Plex Mono','SFMono-Regular',Menlo,Consolas,monospace"

TEMPLATES = {
    "confirmation.html": dict(
        preheader="Your CodeShare signup code is {{ .Token }}",
        eyebrow="CONFIRM YOUR EMAIL",
        heading="Welcome to CodeShare",
        intro="Enter this code in CodeShare to finish creating your account.",
        ignore="Didn&rsquo;t try to sign up? You can safely ignore this email.",
    ),
    # An anonymous visitor signing up is converted in place via
    # updateUser({ email }), which Supabase sends as an "email change" -- to
    # the visitor it is still just signing up, so it reads the same.
    "email_change.html": dict(
        preheader="Your CodeShare signup code is {{ .Token }}",
        eyebrow="CONFIRM YOUR EMAIL",
        heading="Welcome to CodeShare",
        intro="Enter this code in CodeShare to finish creating your account. "
              "Your rooms stay yours &mdash; and now you can make them private.",
        ignore="Didn&rsquo;t try to sign up? You can safely ignore this email.",
    ),
    "recovery.html": dict(
        preheader="Your CodeShare password reset code is {{ .Token }}",
        eyebrow="RESET YOUR PASSWORD",
        heading="Choose a new password",
        intro="Enter this code in CodeShare, then pick a new password.",
        ignore="Didn&rsquo;t ask for a reset? Ignore this email &mdash; your password stays the same.",
    ),
}

LAYOUT = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{heading}</title>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@800&family=IBM+Plex+Mono:wght@600&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:{BG};" bgcolor="{BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{BG}" style="background-color:{BG};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td align="left" style="padding:0 4px 20px 4px;font-family:{DISPLAY};font-size:22px;font-weight:800;letter-spacing:-0.5px;color:{TEXT};">
            <span style="color:{ACC};">{{</span>CodeShare<span style="color:{ACC};">}}</span>
          </td>
        </tr>
        <tr>
          <td bgcolor="{CARD}" style="background-color:{CARD};border:1px solid {LINE};border-radius:18px;padding:32px 28px;">
            <p style="margin:0 0 10px 0;font-family:{MONO};font-size:11px;font-weight:600;letter-spacing:2px;color:{ACC};">{eyebrow}</p>
            <h1 style="margin:0 0 12px 0;font-family:{DISPLAY};font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;color:{TEXT};">{heading}</h1>
            <p style="margin:0 0 24px 0;font-family:{SANS};font-size:15px;line-height:1.6;color:{MUTED};">{intro}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="{PANEL}" style="background-color:{PANEL};border:1px solid {ACC};border-radius:14px;padding:22px 12px;">
                  <p style="margin:0 0 6px 0;font-family:{MONO};font-size:11px;letter-spacing:2px;color:{FAINT};">YOUR CODE</p>
                  <p style="margin:0;font-family:{MONO};font-size:34px;line-height:1.2;font-weight:600;letter-spacing:10px;color:{ACC};">{{{{ .Token }}}}</p>
                </td>
              </tr>
            </table>
            <p style="margin:20px 0 0 0;font-family:{SANS};font-size:13px;line-height:1.6;color:{FAINT};">The code expires in 1 hour. {ignore}</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 4px 0 4px;font-family:{MONO};font-size:11px;line-height:1.6;color:{FAINT};">
            CodeShare &middot; real-time collaborative code sharing
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""

out_dir = Path(__file__).resolve().parent.parent / "supabase" / "templates"
for name, copy in TEMPLATES.items():
    html = LAYOUT.format(BG=BG, CARD=CARD, PANEL=PANEL, TEXT=TEXT, MUTED=MUTED, FAINT=FAINT,
                         ACC=ACC, LINE=LINE, DISPLAY=DISPLAY, SANS=SANS, MONO=MONO, **copy)
    (out_dir / name).write_text(html)
    print("wrote", out_dir / name)
