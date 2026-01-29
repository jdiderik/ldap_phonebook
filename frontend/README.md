
# Error annd return Codes

## Login

-  99: Login, could not reach server (offline, server down or other error)
- 100: Login attempt with password < 4 character (should not be possible)
- 101: Login attempt but account is blocked/blacklisted
- 102.1: Login attempt, but account is not verified yet. Email is send
- 102.2: Login attempt, but account is not verified yet. Should check email for verification link
- 103: Login attempt, valid active account but password is not correct
- 104: Login attempt with NON lubbers.net email address
- 105: First login, link send to email, should click that link to set new password. Email is send
- 106: Login attempt, with a unknown @lubbers.net email, but not with default password. No link send
- 107: Unknown error, access denied, see server log


