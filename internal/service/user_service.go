package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"opshub/internal/database"
	"opshub/internal/model"
)

// UserService provides administrative management for users and permissions.
type UserService struct {
	db *sql.DB
}

// NewUserService constructs a new UserService instance.
func NewUserService(db *sql.DB) *UserService {
	return &UserService{db: db}
}

// CreateUserRequest defines parameters for creating a new user account.
type CreateUserRequest struct {
	Username    string   `json:"username"`
	Password    string   `json:"password"`
	Nickname    string   `json:"nickname"`
	Email       string   `json:"email"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

// ListUsers retrieves all users in the system ordered by id.
func (s *UserService) ListUsers(ctx context.Context) ([]*model.User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, username, role, nickname, email, avatar, security_question, permissions, status, created_at, updated_at
		 FROM users ORDER BY id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query users failed: %w", err)
	}
	defer rows.Close()

	users := make([]*model.User, 0)
	for rows.Next() {
		var u model.User
		var permStr sql.NullString
		var statusStr sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.Nickname, &u.Email, &u.Avatar, &u.SecurityQuestion, &permStr, &statusStr, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan user failed: %w", err)
		}

		if statusStr.Valid && statusStr.String != "" {
			u.Status = statusStr.String
		} else {
			u.Status = model.UserStatusActive
		}

		var rawPerms string
		if permStr.Valid {
			rawPerms = permStr.String
		}
		u.Permissions = model.ParseUserPermissions(rawPerms, u.Role)
		if u.Permissions == nil {
			u.Permissions = []string{}
		}

		users = append(users, &u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users failed: %w", err)
	}

	return users, nil
}

// GetUserByID retrieves a single user by primary key ID.
func (s *UserService) GetUserByID(ctx context.Context, userID int64) (*model.User, error) {
	var u model.User
	var permStr sql.NullString
	var statusStr sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, role, nickname, email, avatar, security_question, permissions, status, created_at, updated_at
		 FROM users WHERE id = ?`,
		userID,
	).Scan(&u.ID, &u.Username, &u.Role, &u.Nickname, &u.Email, &u.Avatar, &u.SecurityQuestion, &permStr, &statusStr, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, fmt.Errorf("query user failed: %w", err)
	}

	if statusStr.Valid && statusStr.String != "" {
		u.Status = statusStr.String
	} else {
		u.Status = model.UserStatusActive
	}

	var rawPerms string
	if permStr.Valid {
		rawPerms = permStr.String
	}
	u.Permissions = model.ParseUserPermissions(rawPerms, u.Role)
	if u.Permissions == nil {
		u.Permissions = []string{}
	}

	return &u, nil
}

// CreateUser registers a new user with specified role, password and permissions.
func (s *UserService) CreateUser(ctx context.Context, req CreateUserRequest) (*model.User, error) {
	req.Username = strings.TrimSpace(req.Username)
	req.Nickname = strings.TrimSpace(req.Nickname)
	req.Email = strings.TrimSpace(req.Email)
	req.Role = strings.TrimSpace(req.Role)

	if len(req.Username) < 3 {
		return nil, errors.New("username must be at least 3 characters")
	}
	if len(req.Password) < 6 {
		return nil, errors.New("password must be at least 6 characters")
	}

	if req.Role == "" {
		req.Role = model.RoleOperator
	} else if req.Role != model.RoleAdmin && req.Role != model.RoleOperator {
		return nil, fmt.Errorf("invalid role: %s", req.Role)
	}

	if req.Nickname == "" {
		req.Nickname = req.Username
	}

	if req.Role == model.RoleOperator && req.Permissions == nil {
		req.Permissions = model.DefaultOperatorPermissions
	}
	if req.Permissions == nil {
		req.Permissions = []string{}
	}

	var exists int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE username = ?", req.Username).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check username failed: %w", err)
	}
	if exists > 0 {
		return nil, errors.New("username already exists")
	}

	passHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password failed: %w", err)
	}

	permsBytes, err := json.Marshal(req.Permissions)
	if err != nil {
		return nil, fmt.Errorf("marshal permissions failed: %w", err)
	}

	now := time.Now()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO users (username, password_hash, role, nickname, email, permissions, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		req.Username,
		string(passHash),
		req.Role,
		req.Nickname,
		req.Email,
		string(permsBytes),
		model.UserStatusActive,
		now,
		now,
	)
	if err != nil {
		if database.IsUniqueViolation(err) {
			return nil, errors.New("username already exists")
		}
		return nil, fmt.Errorf("insert user failed: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &model.User{
		ID:          id,
		Username:    req.Username,
		Role:        req.Role,
		Nickname:    req.Nickname,
		Email:       req.Email,
		Permissions: req.Permissions,
		Status:      model.UserStatusActive,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

// UpdatePermissions updates the permission codes assigned to a user.
func (s *UserService) UpdatePermissions(ctx context.Context, userID int64, permissions []string) error {
	if permissions == nil {
		permissions = []string{}
	}

	var exists int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE id = ?", userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("query user failed: %w", err)
	}
	if exists == 0 {
		return errors.New("user not found")
	}

	permsBytes, err := json.Marshal(permissions)
	if err != nil {
		return fmt.Errorf("marshal permissions failed: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		"UPDATE users SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		string(permsBytes),
		userID,
	)
	if err != nil {
		return fmt.Errorf("update permissions failed: %w", err)
	}

	return nil
}

// UpdateStatus changes the active/disabled status of a user with anti-lockout protection.
func (s *UserService) UpdateStatus(ctx context.Context, userID int64, status string, currentAdmin string) error {
	status = strings.TrimSpace(status)
	if status != model.UserStatusActive && status != model.UserStatusDisabled {
		return errors.New("invalid status: must be active or disabled")
	}

	var targetUsername string
	err := s.db.QueryRowContext(ctx, "SELECT username FROM users WHERE id = ?", userID).Scan(&targetUsername)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("user not found")
		}
		return fmt.Errorf("query user failed: %w", err)
	}

	if targetUsername == "admin" && status == model.UserStatusDisabled {
		return errors.New("cannot disable super admin")
	}
	if currentAdmin != "" && targetUsername == currentAdmin && status == model.UserStatusDisabled {
		return errors.New("cannot disable self")
	}

	_, err = s.db.ExecContext(ctx,
		"UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		status,
		userID,
	)
	if err != nil {
		return fmt.Errorf("update status failed: %w", err)
	}

	return nil
}

// ResetPassword forcefully changes a user's password without old password verification.
func (s *UserService) ResetPassword(ctx context.Context, userID int64, newPassword string) error {
	newPassword = strings.TrimSpace(newPassword)
	if newPassword == "" {
		return errors.New("new password cannot be empty")
	}
	if len(newPassword) < 6 {
		return errors.New("password must be at least 6 characters")
	}

	var exists int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE id = ?", userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("query user failed: %w", err)
	}
	if exists == 0 {
		return errors.New("user not found")
	}

	passHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password failed: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		"UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		string(passHash),
		userID,
	)
	if err != nil {
		return fmt.Errorf("update user password failed: %w", err)
	}

	return nil
}

// DeleteUser deletes a user from the system with anti-lockout protection for the admin and self.
func (s *UserService) DeleteUser(ctx context.Context, userID int64, currentAdmin string) error {
	var targetUsername string
	err := s.db.QueryRowContext(ctx, "SELECT username FROM users WHERE id = ?", userID).Scan(&targetUsername)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("user not found")
		}
		return fmt.Errorf("query user failed: %w", err)
	}

	if targetUsername == "admin" {
		return errors.New("cannot delete super admin")
	}
	if currentAdmin != "" && targetUsername == currentAdmin {
		return errors.New("cannot delete self")
	}

	res, err := s.db.ExecContext(ctx, "DELETE FROM users WHERE id = ?", userID)
	if err != nil {
		return fmt.Errorf("delete user failed: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}
