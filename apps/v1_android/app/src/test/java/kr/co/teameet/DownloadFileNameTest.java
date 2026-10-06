package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import org.junit.Test;

public final class DownloadFileNameTest {
    @Test public void prefersUtf8NameOverAsciiReplacementFromApi() {
        assertEquals("QA1005-팀밋-검증.txt", DownloadFileName.fromContentDisposition(
            "attachment; filename=\"QA1005-??-??.txt\"; filename*=UTF-8''QA1005-%ED%8C%80%EB%B0%8B-%EA%B2%80%EC%A6%9D.txt"));
    }

    @Test public void extendedNameDoesNotDependOnParameterOrder() {
        assertEquals("팀.txt", DownloadFileName.fromContentDisposition(
            "attachment; FILENAME*=utf-8'ko'%ED%8C%80.txt; filename=\"fallback.txt\""));
    }

    @Test public void preservesPlusAndDecodesSpaces() {
        assertEquals("a+b c.txt", DownloadFileName.fromContentDisposition(
            "attachment; filename*=UTF-8''a+b%20c.txt"));
    }

    @Test public void acceptsOrdinaryQuotedAndUnquotedNames() {
        assertEquals("a;b.pdf", DownloadFileName.fromContentDisposition("attachment; filename=\"a;b.pdf\""));
        assertEquals("document.pdf", DownloadFileName.fromContentDisposition("attachment; filename=document.pdf"));
    }

    @Test public void malformedExtendedNamesUseOrdinaryName() {
        for (String value : new String[] {"UTF-8''bad%ZZ.txt", "UTF-8''%FF.txt", "UTF-8''%00.txt", "unknown''a.txt"}) {
            assertEquals("safe.pdf", DownloadFileName.fromContentDisposition(
                "attachment; filename=safe.pdf; filename*=" + value));
        }
    }

    @Test public void stripsPathsAndRejectsControlOrEmptyNames() {
        assertEquals("document.pdf", DownloadFileName.fromContentDisposition("attachment; filename=\"../../document.pdf\""));
        assertEquals("document.pdf", DownloadFileName.fromContentDisposition("attachment; filename*=UTF-8''..%5Cdocument.pdf"));
        assertNull(DownloadFileName.fromContentDisposition("attachment; filename=\"..\""));
        assertNull(DownloadFileName.fromContentDisposition("attachment; filename=\"x\nx.pdf\""));
        assertNull(DownloadFileName.fromContentDisposition("attachment; filename=\u0000.txt"));
        assertNull(DownloadFileName.fromContentDisposition(null));
        assertNull(DownloadFileName.fromContentDisposition("attachment"));
    }
}
