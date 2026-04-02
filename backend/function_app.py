"""
xCloudLisbot — Azure Functions v4 Backend (Modularized)
All endpoints are defined in blueprints/ and registered here.
"""

import azure.functions as func

from blueprints.health import bp as health_bp
from blueprints.auth_microsoft import bp as auth_microsoft_bp
from blueprints.auth_google import bp as auth_google_bp
from blueprints.auth_github import bp as auth_github_bp
from blueprints.auth_apple import bp as auth_apple_bp
from blueprints.auth_dev import bp as auth_dev_bp
from blueprints.meetings import bp as meetings_bp
from blueprints.speech import bp as speech_bp
from blueprints.summarize import bp as summarize_bp
from blueprints.terminology import bp as terminology_bp
from blueprints.templates import bp as templates_bp
from blueprints.upload import bp as upload_bp
from blueprints.share import bp as share_bp
from blueprints.calendar_bp import bp as calendar_bp

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

app.register_functions(health_bp)
app.register_functions(auth_microsoft_bp)
app.register_functions(auth_google_bp)
app.register_functions(auth_github_bp)
app.register_functions(auth_apple_bp)
app.register_functions(auth_dev_bp)
app.register_functions(meetings_bp)
app.register_functions(speech_bp)
app.register_functions(summarize_bp)
app.register_functions(terminology_bp)
app.register_functions(templates_bp)
app.register_functions(upload_bp)
app.register_functions(share_bp)
app.register_functions(calendar_bp)
