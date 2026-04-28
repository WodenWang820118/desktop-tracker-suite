package com.wodendev.springbackend.service;

import com.wodendev.springbackend.entity.Task;
import com.wodendev.springbackend.exception.DatabaseExceptionHelper;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TaskService {
    private final JdbcTemplate jdbc;
    private final Schema schema;
    private static final RowMapper<Task> ROW_MAPPER = new RowMapper<>() {
        @Override
        public Task mapRow(ResultSet rs, int rowNum) throws SQLException {
            Task t = new Task();
            t.setId(rs.getString("id"));
            t.setText(rs.getString("text"));
            t.setDay(rs.getString("day"));
            t.setReminder(rs.getBoolean("reminder"));
            t.setCreatedAt(readTimestamp(rs, "createdAt"));
            t.setUpdatedAt(readTimestamp(rs, "updatedAt"));
            return t;
        }
    };

    public Task create(Task task) {
        if (task == null) {
            throw new IllegalArgumentException("Task must not be null");
        }

        if (!StringUtils.hasText(task.getId())) {
            task.setId(UUID.randomUUID().toString());
        }

        Schema s = schema;
        StringBuilder cols = new StringBuilder("id, text, " + quoteIdentifier("day") + ", reminder");
        StringBuilder vals = new StringBuilder("?, ?, ?, ?");
        if (s.getCreatedAtColumn() != null) {
            cols.append(", ").append(quoteIdentifier(s.getCreatedAtColumn()));
            vals.append(", CURRENT_TIMESTAMP");
        }
        if (s.getUpdatedAtColumn() != null) {
            cols.append(", ").append(quoteIdentifier(s.getUpdatedAtColumn()));
            vals.append(", CURRENT_TIMESTAMP");
        }

        try {
            String sql = "INSERT INTO tasks(" + cols + ") VALUES(" + vals + ")";
            jdbc.update(sql, task.getId(), task.getText(), task.getDay(), task.isReminder() ? 1 : 0);
            return findOne(task.getId()).orElse(task);
        } catch (DataAccessException ex) {
            throw DatabaseExceptionHelper.wrapOperation("TASK_CREATE_FAILED", "create", ex);
        }
    }

    public Page<Task> findAll(Integer page, Integer limit, String search) {
        int p = (page == null || page < 1) ? 1 : page;
        int l = (limit == null || limit < 1) ? 10 : limit;
        int offset = (p - 1) * l;

        Schema s = schema;

        String where = "";
        Object[] paramsCount;
        Object[] paramsRows;
        if (search != null && !search.trim().isEmpty()) {
            where = " WHERE text LIKE ? ";
            String like = "%" + search.trim() + "%";
            paramsCount = new Object[]{like};
            paramsRows = new Object[]{like, l, offset};
        } else {
            paramsCount = new Object[]{};
            paramsRows = new Object[]{l, offset};
        }

        try {
            String countSql = "SELECT COUNT(*) FROM tasks" + where;
            Long totalObj;
            if (where.isEmpty()) {
                totalObj = jdbc.queryForObject(countSql, Long.class);
            } else {
                totalObj = jdbc.queryForObject(countSql, Long.class, paramsCount);
            }
            long total = (totalObj != null) ? totalObj.longValue() : 0L;

            String orderBy;
            if (s.getCreatedAtColumn() != null) {
                orderBy = quoteIdentifier(s.getCreatedAtColumn());
            } else if (s.getUpdatedAtColumn() != null) {
                orderBy = quoteIdentifier(s.getUpdatedAtColumn());
            } else {
                orderBy = "id";
            }

            String sql =
                    "SELECT id, text, "
                            + quoteIdentifier("day")
                            + " AS day, reminder, "
                            + selectTimestampColumn(s.getCreatedAtColumn(), "createdAt")
                            + ", "
                            + selectTimestampColumn(s.getUpdatedAtColumn(), "updatedAt")
                            + " FROM tasks"
                            + where
                            + " ORDER BY "
                            + orderBy
                            + " DESC LIMIT ? OFFSET ?";
            List<Task> rows = jdbc.query(sql, ROW_MAPPER, paramsRows);

            return new PageImpl<>(rows, org.springframework.data.domain.PageRequest.of(p - 1, l), total);
        } catch (DataAccessException ex) {
            throw DatabaseExceptionHelper.wrapOperation("TASK_QUERY_FAILED", "findAll", ex);
        }
    }

    public Optional<Task> findOne(String id) {
        try {
            Schema s = schema;
            String sql =
                    "SELECT id, text, "
                            + quoteIdentifier("day")
                            + " AS day, reminder, "
                            + selectTimestampColumn(s.getCreatedAtColumn(), "createdAt")
                            + ", "
                            + selectTimestampColumn(s.getUpdatedAtColumn(), "updatedAt")
                            + " FROM tasks WHERE id = ?";
            List<Task> list = jdbc.query(sql, ROW_MAPPER, id);
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (DataAccessException ex) {
            throw DatabaseExceptionHelper.wrapOperation("TASK_QUERY_FAILED", "findOne", ex);
        }
    }

    public Optional<Task> update(String id, Task task) {
        Schema s = schema;
        String setUpdatedAt =
                (s.getUpdatedAtColumn() != null)
                        ? (", " + quoteIdentifier(s.getUpdatedAtColumn()) + " = CURRENT_TIMESTAMP")
                        : "";
        String sql =
                "UPDATE tasks SET text = ?, "
                        + quoteIdentifier("day")
                        + " = ?, reminder = ?"
                        + setUpdatedAt
                        + " WHERE id = ?";
        try {
            int updated = jdbc.update(sql, task.getText(), task.getDay(), task.isReminder() ? 1 : 0, id);
            return updated > 0 ? findOne(id) : Optional.empty();
        } catch (DataAccessException ex) {
            throw DatabaseExceptionHelper.wrapOperation("TASK_UPDATE_FAILED", "update", ex);
        }
    }

    public boolean remove(String id) {
        try {
            String sql = "DELETE FROM tasks WHERE id = ?";
            int affected = jdbc.update(sql, id);
            return affected > 0;
        } catch (DataAccessException ex) {
            throw DatabaseExceptionHelper.wrapOperation("TASK_DELETE_FAILED", "remove", ex);
        }
    }

    public long removeByName(String name) {
        try {
            String sql = "DELETE FROM tasks WHERE text = ?";
            return jdbc.update(sql, name);
        } catch (DataAccessException ex) {
            throw DatabaseExceptionHelper.wrapOperation("TASK_DELETE_FAILED", "removeByName", ex);
        }
    }

    private static String selectTimestampColumn(String columnName, String alias) {
        if (!StringUtils.hasText(columnName)) {
            return "NULL AS " + alias;
        }

        return quoteIdentifier(columnName) + " AS " + alias;
    }

    private static String quoteIdentifier(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private static LocalDateTime readTimestamp(ResultSet rs, String columnLabel) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(columnLabel);
        if (timestamp != null) {
            return timestamp.toLocalDateTime();
        }

        String rawValue = rs.getString(columnLabel);
        if (!StringUtils.hasText(rawValue)) {
            return null;
        }

        try {
            return Timestamp.valueOf(rawValue).toLocalDateTime();
        } catch (IllegalArgumentException ignored) {
            return LocalDateTime.parse(rawValue);
        }
    }
}
