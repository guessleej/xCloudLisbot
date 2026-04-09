"""Tests for meetings CRUD endpoints — covers data flow integrity, auth, and edge cases."""

import pytest


class TestCreateMeeting:
    """POST /api/meetings"""

    def test_create_meeting_success(self, client, auth_header):
        res = client.post("/api/meetings", json={"title": "Test Meeting"}, headers=auth_header)
        assert res.status_code == 200
        data = res.json()
        assert data["title"] == "Test Meeting"
        assert data["status"] == "recording"
        assert data["id"]  # UUID should exist

    def test_create_meeting_no_auth(self, client):
        res = client.post("/api/meetings", json={"title": "No Auth"})
        assert res.status_code == 401

    def test_create_meeting_default_title(self, client, auth_header):
        res = client.post("/api/meetings", json={}, headers=auth_header)
        assert res.status_code == 200
        assert res.json()["title"] == "未命名會議"


class TestListMeetings:
    """GET /api/meetings"""

    def test_list_empty(self, client, auth_header):
        res = client.get("/api/meetings", headers=auth_header)
        assert res.status_code == 200
        assert res.json()["meetings"] == []

    def test_list_after_create(self, client, auth_header):
        client.post("/api/meetings", json={"title": "M1"}, headers=auth_header)
        client.post("/api/meetings", json={"title": "M2"}, headers=auth_header)
        res = client.get("/api/meetings", headers=auth_header)
        assert res.status_code == 200
        meetings = res.json()["meetings"]
        assert len(meetings) == 2

    def test_list_no_auth(self, client):
        res = client.get("/api/meetings")
        assert res.status_code == 401

    def test_list_isolation(self, client, auth_header, auth_header_other):
        """User A's meetings should not appear in User B's list."""
        client.post("/api/meetings", json={"title": "A's meeting"}, headers=auth_header)
        res = client.get("/api/meetings", headers=auth_header_other)
        assert len(res.json()["meetings"]) == 0


class TestGetMeeting:
    """GET /api/meetings/{id}"""

    def test_get_meeting_success(self, client, auth_header):
        create_res = client.post("/api/meetings", json={"title": "Detail"}, headers=auth_header)
        mid = create_res.json()["id"]
        res = client.get(f"/api/meetings/{mid}", headers=auth_header)
        assert res.status_code == 200
        data = res.json()
        assert data["title"] == "Detail"
        assert "transcripts" in data
        assert "summary" in data

    def test_get_meeting_not_found(self, client, auth_header):
        res = client.get("/api/meetings/nonexistent-id", headers=auth_header)
        assert res.status_code == 404

    def test_get_meeting_forbidden(self, client, auth_header, auth_header_other):
        create_res = client.post("/api/meetings", json={"title": "Private"}, headers=auth_header)
        mid = create_res.json()["id"]
        res = client.get(f"/api/meetings/{mid}", headers=auth_header_other)
        assert res.status_code == 403


class TestDataFlowIntegrity:
    """Verify: create → write → read back → data matches (Vibe Coding Checklist #1)."""

    def test_transcript_persistence(self, client, auth_header):
        """The exact bug that started this: transcripts must persist after save."""
        # 1. Create meeting
        create_res = client.post("/api/meetings", json={"title": "Transcript Test"}, headers=auth_header)
        mid = create_res.json()["id"]

        # 2. Save transcripts
        segments = [
            {"id": "seg-1", "speaker": "說話者 1", "text": "Hello world", "offset": 0, "duration": 1000, "confidence": 0.95},
            {"id": "seg-2", "speaker": "說話者 2", "text": "你好", "offset": 1000, "duration": 800, "confidence": 0.9},
        ]
        save_res = client.post(f"/api/meetings/{mid}/transcripts", json={"segments": segments}, headers=auth_header)
        assert save_res.status_code == 200
        assert save_res.json()["saved"] == 2

        # 3. Read back and verify
        detail_res = client.get(f"/api/meetings/{mid}", headers=auth_header)
        data = detail_res.json()
        assert len(data["transcripts"]) == 2
        assert data["transcripts"][0]["text"] == "Hello world"
        assert data["transcripts"][1]["text"] == "你好"

    def test_meeting_update_persists(self, client, auth_header):
        create_res = client.post("/api/meetings", json={"title": "Old Title"}, headers=auth_header)
        mid = create_res.json()["id"]
        client.patch(f"/api/meetings/{mid}", json={"title": "New Title"}, headers=auth_header)
        detail = client.get(f"/api/meetings/{mid}", headers=auth_header).json()
        assert detail["title"] == "New Title"

    def test_delete_cascades(self, client, auth_header):
        """Delete meeting → transcripts should also be gone."""
        create_res = client.post("/api/meetings", json={"title": "To Delete"}, headers=auth_header)
        mid = create_res.json()["id"]
        client.post(f"/api/meetings/{mid}/transcripts",
                    json={"segments": [{"id": "s1", "speaker": "A", "text": "hi"}]},
                    headers=auth_header)
        del_res = client.delete(f"/api/meetings/{mid}", headers=auth_header)
        assert del_res.status_code == 200
        get_res = client.get(f"/api/meetings/{mid}", headers=auth_header)
        assert get_res.status_code == 404


class TestTranscriptsSave:
    """POST /api/meetings/{id}/transcripts"""

    def test_save_empty_segments(self, client, auth_header):
        create_res = client.post("/api/meetings", json={"title": "Empty"}, headers=auth_header)
        mid = create_res.json()["id"]
        res = client.post(f"/api/meetings/{mid}/transcripts", json={"segments": []}, headers=auth_header)
        assert res.status_code == 200
        assert res.json()["saved"] == 0

    def test_save_forbidden(self, client, auth_header, auth_header_other):
        create_res = client.post("/api/meetings", json={"title": "Mine"}, headers=auth_header)
        mid = create_res.json()["id"]
        res = client.post(f"/api/meetings/{mid}/transcripts",
                          json={"segments": [{"text": "hack"}]},
                          headers=auth_header_other)
        assert res.status_code == 403


class TestDeleteMeeting:
    """DELETE /api/meetings/{id}"""

    def test_delete_success(self, client, auth_header):
        mid = client.post("/api/meetings", json={"title": "Del"}, headers=auth_header).json()["id"]
        res = client.delete(f"/api/meetings/{mid}", headers=auth_header)
        assert res.status_code == 200

    def test_delete_forbidden(self, client, auth_header, auth_header_other):
        mid = client.post("/api/meetings", json={"title": "X"}, headers=auth_header).json()["id"]
        res = client.delete(f"/api/meetings/{mid}", headers=auth_header_other)
        assert res.status_code == 403

    def test_delete_not_found(self, client, auth_header):
        res = client.delete("/api/meetings/fake-id", headers=auth_header)
        assert res.status_code == 404


class TestBatchDelete:
    """POST /api/meetings/batch-delete"""

    def test_batch_delete(self, client, auth_header):
        ids = []
        for i in range(3):
            ids.append(client.post("/api/meetings", json={"title": f"B{i}"}, headers=auth_header).json()["id"])
        res = client.post("/api/meetings/batch-delete", json={"ids": ids}, headers=auth_header)
        assert res.status_code == 200
        assert res.json()["count"] == 3
        # Verify all gone
        for mid in ids:
            assert client.get(f"/api/meetings/{mid}", headers=auth_header).status_code == 404

    def test_batch_delete_skips_others(self, client, auth_header, auth_header_other):
        mid = client.post("/api/meetings", json={"title": "Mine"}, headers=auth_header).json()["id"]
        res = client.post("/api/meetings/batch-delete", json={"ids": [mid]}, headers=auth_header_other)
        assert res.json()["count"] == 0  # Shouldn't delete someone else's meeting


class TestSharedMeetingAccess:
    """Verify shared users can access meetings — fixes the 403 bug."""

    def _share(self, client, mid, auth_header, email="other@example.com", permission="view"):
        return client.post(f"/api/meetings/{mid}/share",
            json={"email": email, "permission": permission},
            headers=auth_header)

    def test_shared_user_can_view_meeting(self, client, auth_header, auth_header_other):
        """The core 403 bug: shared user should be able to view."""
        mid = client.post("/api/meetings", json={"title": "Shared"}, headers=auth_header).json()["id"]
        self._share(client, mid, auth_header)
        res = client.get(f"/api/meetings/{mid}", headers=auth_header_other)
        assert res.status_code == 200
        data = res.json()
        assert data["title"] == "Shared"
        assert data["isShared"] is True

    def test_shared_view_cannot_edit(self, client, auth_header, auth_header_other):
        mid = client.post("/api/meetings", json={"title": "View Only"}, headers=auth_header).json()["id"]
        self._share(client, mid, auth_header, permission="view")
        res = client.patch(f"/api/meetings/{mid}", json={"title": "Hacked"}, headers=auth_header_other)
        assert res.status_code == 403

    def test_shared_edit_can_update(self, client, auth_header, auth_header_other):
        mid = client.post("/api/meetings", json={"title": "Editable"}, headers=auth_header).json()["id"]
        self._share(client, mid, auth_header, permission="edit")
        res = client.patch(f"/api/meetings/{mid}", json={"title": "Updated"}, headers=auth_header_other)
        assert res.status_code == 200

    def test_shared_meetings_appear_in_list(self, client, auth_header, auth_header_other):
        mid = client.post("/api/meetings", json={"title": "Listed"}, headers=auth_header).json()["id"]
        self._share(client, mid, auth_header)
        res = client.get("/api/meetings", headers=auth_header_other)
        meetings = res.json()["meetings"]
        assert len(meetings) == 1
        assert meetings[0]["isShared"] is True

    def test_unshared_user_still_forbidden(self, client, auth_header, auth_header_other):
        mid = client.post("/api/meetings", json={"title": "Private"}, headers=auth_header).json()["id"]
        # No share created — other user should get 403
        res = client.get(f"/api/meetings/{mid}", headers=auth_header_other)
        assert res.status_code == 403

    def test_share_sends_email_flag(self, client, auth_header):
        mid = client.post("/api/meetings", json={"title": "Email Test"}, headers=auth_header).json()["id"]
        res = self._share(client, mid, auth_header, email="notify@example.com")
        assert res.status_code == 200
        assert res.json()["emailSent"] is True
