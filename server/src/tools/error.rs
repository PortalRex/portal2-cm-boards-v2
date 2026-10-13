//! The error type handlers return. Whatever went wrong is logged in full on the server; the
//! client only gets a short generic message, so database and internal details never leak.
use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use std::{fmt, io};

#[derive(Debug)]
pub enum ErrorType {
    DbError,
    NotFound,
    Reqwest,
    Internal,
    Unknown,
}

#[derive(Debug)]
pub struct ServerError {
    pub error_message: String,
    pub error_type: ErrorType,
}

#[derive(Serialize)]
pub struct ErrResponse {
    pub error: String,
}

pub type Result<T, E = ServerError> = std::result::Result<T, E>;

impl From<io::Error> for ServerError {
    fn from(error: io::Error) -> Self {
        ServerError {
            error_message: format!("{error}"),
            error_type: ErrorType::Unknown,
        }
    }
}

impl From<anyhow::Error> for ServerError {
    fn from(error: anyhow::Error) -> Self {
        ServerError {
            error_message: format!("{error}"),
            error_type: ErrorType::Internal,
        }
    }
}

impl From<reqwest::Error> for ServerError {
    fn from(error: reqwest::Error) -> Self {
        ServerError {
            error_message: format!("{error}"),
            error_type: ErrorType::Reqwest,
        }
    }
}

impl From<sqlx::Error> for ServerError {
    fn from(error: sqlx::Error) -> Self {
        ServerError {
            error_message: format!("{error}"),
            error_type: match error {
                sqlx::Error::RowNotFound => ErrorType::NotFound,
                _ => ErrorType::DbError,
            },
        }
    }
}

impl fmt::Display for ServerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Error -> {self:?}")
    }
}

impl ResponseError for ServerError {
    fn status_code(&self) -> StatusCode {
        match self.error_type {
            ErrorType::NotFound => StatusCode::NOT_FOUND,
            ErrorType::Reqwest => StatusCode::SERVICE_UNAVAILABLE,
            ErrorType::DbError | ErrorType::Internal | ErrorType::Unknown => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
    fn error_response(&self) -> HttpResponse {
        let message = match self.error_type {
            ErrorType::NotFound => "Not found.",
            ErrorType::Reqwest => "An outside service didn't answer; try again shortly.",
            ErrorType::DbError | ErrorType::Internal | ErrorType::Unknown => "Something went wrong on the server.",
        };
        if !matches!(self.error_type, ErrorType::NotFound) {
            log::error!("request failed ({:?}): {}", self.error_type, self.error_message);
        }
        HttpResponse::build(self.status_code()).json(ErrResponse { error: message.to_string() })
    }
}
