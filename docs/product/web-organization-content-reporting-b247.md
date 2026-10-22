# Organization content reporting on Web — B247

Web users can report public organization Posts and Events with a reason from the
moderation vocabulary and optional details. Details are trimmed, normalized,
and limited to the API's 1500-character bound; empty details are omitted.

The form reports success only after the server returns a pending report. A
timeout, network or server outage, or malformed success response leaves the
result uncertain and prevents another submission for that content in the
current view. Definite request rejections remain retryable.
